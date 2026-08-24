// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  factsList: vi.fn().mockResolvedValue([]),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/career-profile/repository", () => ({
  careerFactRepository: { list: mocks.factsList },
}));

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

const row = {
  id: runId,
  application_id: applicationId,
  user_id: userId,
  input_hash: "a".repeat(64),
  provider: "deepseek",
  model: "deepseek-v4-flash",
  status: "succeeded",
  attempt_count: 1,
  result: {
    acceptedRequirementCount: 1,
    rejectedRequirementCount: 0,
    rejectedEvidenceCount: 0,
    ai: {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: null,
      usage: {
        inputCacheHitTokens: 0,
        inputCacheMissTokens: 0,
        outputTokens: 0,
      },
      priceScheduleVersion: null,
    },
    estimatedCost: null,
  },
  error_code: null,
  created_at: "2026-08-24T00:00:00.000Z",
};

function queryFixture(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  const client = { from: vi.fn().mockReturnValue(chain) };
  mocks.createClient.mockResolvedValue(client);
  return { chain, client };
}

describe("JD analysis latest-run repository queries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("filters requirements by the selected analysis run when a run id is supplied", async () => {
    const requirementChain = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
    requirementChain.select.mockReturnValue(requirementChain);
    requirementChain.eq.mockReturnValue(requirementChain);
    requirementChain.order.mockResolvedValue({
      data: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          analysis_run_id: runId,
          application_id: applicationId,
          category: "skill",
          requirement_text: "Advanced SQL",
          translation_zh: "高级 SQL",
          source_excerpt: "Advanced SQL experience is required.",
          priority: "core",
          match_status: "none",
          match_reason: null,
          sort_order: 0,
        },
      ],
      error: null,
    });
    const evidenceChain = { select: vi.fn(), eq: vi.fn() };
    evidenceChain.select.mockReturnValue(evidenceChain);
    evidenceChain.eq.mockReturnValue(evidenceChain);
    evidenceChain.eq.mockReturnValue(evidenceChain);
    evidenceChain.eq.mockReturnValue(evidenceChain);
    evidenceChain.eq.mockReturnValue(evidenceChain);
    const client = { from: vi.fn().mockReturnValueOnce(requirementChain).mockReturnValueOnce(evidenceChain) };
    mocks.createClient.mockResolvedValue(client);
    const { jdAnalysisRepository } = await import("./repository");
    const requirements = await jdAnalysisRepository.listRequirements(userId, applicationId, runId);
    expect(requirementChain.eq).toHaveBeenCalledWith("analysis_run_id", runId);
    expect(requirements[0]).toMatchObject({
      text: "Advanced SQL",
      translationZh: "高级 SQL",
    });
  });

  it("filters latest succeeded analysis by owner/application/status and uses deterministic ordering", async () => {
    const { chain, client } = queryFixture({ data: row, error: null });
    const { jdAnalysisRepository } = await import("./repository");

    const result = await jdAnalysisRepository.getLatestSucceeded(
      userId,
      applicationId,
    );

    expect(result).toMatchObject({
      id: runId,
      applicationId,
      userId,
      status: "succeeded",
      result: {
        jdTranslationZh: null,
        translationAvailable: false,
      },
    });
    expect(client.from).toHaveBeenCalledWith("application_analysis_runs");
    expect(chain.eq).toHaveBeenNthCalledWith(1, "user_id", userId);
    expect(chain.eq).toHaveBeenNthCalledWith(2, "application_id", applicationId);
    expect(chain.eq).toHaveBeenNthCalledWith(3, "status", "succeeded");
    expect(chain.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(chain.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("hydrates a new translated run without breaking legacy results", async () => {
    queryFixture({
      data: {
        ...row,
        result: {
          ...row.result,
          jdTranslationZh: "在国际市场推动产品探索。",
        },
      },
      error: null,
    });
    const { jdAnalysisRepository } = await import("./repository");

    await expect(
      jdAnalysisRepository.getLatestSucceeded(userId, applicationId),
    ).resolves.toMatchObject({
      result: {
        jdTranslationZh: "在国际市场推动产品探索。",
        translationAvailable: true,
      },
    });
  });

  it("persists the full and per-requirement translations in one completion RPC", async () => {
    const translatedResult = {
      ...row.result,
      jdTranslationZh: "要求具备高级 SQL。",
    };
    const rpc = vi.fn().mockResolvedValue({
      data: { ...row, result: translatedResult },
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });
    const { jdAnalysisRepository } = await import("./repository");

    await jdAnalysisRepository.complete({
      runId,
      jdTranslationZh: "要求具备高级 SQL。",
      requirements: [
        {
          category: "skill",
          text: "Advanced SQL",
          translationZh: "高级 SQL",
          sourceExcerpt: "Advanced SQL experience is required.",
          priority: "core",
          matchStatus: "none",
          matchReason: null,
          matchedFactIds: [],
        },
      ],
      rejectedRequirementCount: 0,
      rejectedEvidenceCount: 0,
      aiUsage: translatedResult.ai,
      estimatedCost: null,
    });

    expect(rpc).toHaveBeenCalledWith(
      "complete_application_analysis",
      expect.objectContaining({
        jd_translation_zh: "要求具备高级 SQL。",
        accepted_requirements: [
          expect.objectContaining({ translationZh: "高级 SQL" }),
        ],
      }),
    );
  });

  it("applies the deterministic id tie-break to the unfiltered latest query", async () => {
    const { chain } = queryFixture({ data: null, error: null });
    const { jdAnalysisRepository } = await import("./repository");

    await expect(jdAnalysisRepository.getLatest(userId, applicationId)).resolves.toBeNull();
    expect(chain.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(chain.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
  });

  it("returns null for no succeeded run and maps query errors to the stable repository code", async () => {
    queryFixture({ data: null, error: null });
    const { jdAnalysisRepository } = await import("./repository");
    await expect(
      jdAnalysisRepository.getLatestSucceeded(userId, applicationId),
    ).resolves.toBeNull();

    queryFixture({ data: null, error: { code: "PGRST116" } });
    vi.resetModules();
    const reloaded = await import("./repository");
    await expect(
      reloaded.jdAnalysisRepository.getLatestSucceeded(userId, applicationId),
    ).rejects.toMatchObject({ code: "application-analysis-not-found" });
  });

  it("rejects malformed stored result data during hydration", async () => {
    queryFixture({ data: { ...row, status: "bogus" }, error: null });
    const { jdAnalysisRepository } = await import("./repository");
    await expect(
      jdAnalysisRepository.getLatestSucceeded(userId, applicationId),
    ).rejects.toMatchObject({ code: "invalid-stored-application-analysis" });
  });
});
