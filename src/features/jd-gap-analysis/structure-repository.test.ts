// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createJDStructureRepository } from "./structure-repository";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const requirementId = "33333333-3333-4333-8333-333333333333";
const criterionId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-08-25T00:00:00.000Z";

const ai = {
  provider: "deepseek",
  model: "deepseek-chat",
  requestId: null,
  usage: { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3 },
  priceScheduleVersion: null,
};

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    application_id: applicationId,
    user_id: userId,
    jd_sha256: "a".repeat(64),
    input_hash: "b".repeat(64),
    provider: "deepseek",
    model: "deepseek-chat",
    schema_version: "jd-analysis-v3",
    prompt_version: "jd-structure-v3",
    status: "succeeded",
    attempt_count: 1,
    jd_translation_zh: "要求熟练使用 SQL。",
    result: {
      requirementCount: 1,
      criterionCount: 1,
      translationAvailable: true,
      ai,
      estimatedCost: null,
    },
    error_code: null,
    error_message: null,
    created_at: timestamp,
    updated_at: timestamp,
    started_at: timestamp,
    finished_at: timestamp,
    ...overrides,
  };
}

function requirementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: requirementId,
    run_id: runId,
    application_id: applicationId,
    user_id: userId,
    category: "skill",
    requirement_type: "required",
    original_text: "Advanced SQL",
    translation_zh: "高级 SQL",
    source_excerpt: "Advanced SQL experience is required.",
    allows_equivalent: false,
    explicit_gate: false,
    sort_order: 0,
    created_at: timestamp,
    ...overrides,
  };
}

function criterionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: criterionId,
    requirement_id: requirementId,
    run_id: runId,
    application_id: applicationId,
    user_id: userId,
    group_key: "g1",
    group_rule: "all",
    kind: "tool",
    original_text: "Advanced SQL",
    translation_zh: "高级 SQL",
    constraint_payload: { operator: "exact", value: "SQL", unit: null },
    sort_order: 0,
    created_at: timestamp,
    ...overrides,
  };
}

function query(result: { data: unknown; error?: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data: result.data, error: result.error ?? null });
  chain.then.mockImplementation((resolve) =>
    Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve),
  );
  return chain;
}

function client(tableData: Record<string, unknown> = {}) {
  const queries = new Map<string, ReturnType<typeof query>>();
  const from = vi.fn((table: string) => {
    const chain = query({ data: tableData[table] ?? null });
    queries.set(table, chain);
    return chain;
  });
  const rpc = vi.fn().mockResolvedValue({ data: runRow(), error: null });
  return { from, rpc, queries };
}

describe("JD structure repository", () => {
  it("calls every owner-safe RPC with exact parameter names and strips local keys", async () => {
    const supabase = client();
    const repository = createJDStructureRepository(async () => supabase as never);

    await repository.createOrGet({
      applicationId,
      jdSha256: "a".repeat(64),
      inputHash: "b".repeat(64),
      provider: "deepseek",
      model: "deepseek-chat",
      schemaVersion: "jd-analysis-v3",
      promptVersion: "jd-structure-v3",
    });
    await repository.claim(runId, 0, "queued");
    await repository.complete({
      runId,
      expectedAttemptCount: 1,
      output: {
        jdTranslationZh: "要求熟练使用 SQL。",
        requirements: [{
          key: "r1",
          category: "skill",
          requirementType: "required",
          originalText: "Advanced SQL",
          translationZh: "高级 SQL",
          sourceExcerpt: "Advanced SQL experience is required.",
          allowsEquivalent: false,
          explicitGate: false,
          criteria: [{
            key: "c1",
            groupKey: "g1",
            groupRule: "all",
            kind: "tool",
            originalText: "Advanced SQL",
            translationZh: "高级 SQL",
            constraint: { operator: "exact", value: "SQL", unit: null },
          }],
        }],
      },
      ai,
      estimatedCost: null,
    });
    await repository.fail({
      runId,
      expectedAttemptCount: 2,
      errorCode: "jd-structure-failed",
      errorMessage: "safe",
    });

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, "create_or_get_jd_structure", {
      target_application_id: applicationId,
      target_jd_sha256: "a".repeat(64),
      target_input_hash: "b".repeat(64),
      target_provider: "deepseek",
      target_model: "deepseek-chat",
      target_schema_version: "jd-analysis-v3",
      target_prompt_version: "jd-structure-v3",
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, "claim_jd_structure", {
      target_run_id: runId,
      expected_attempt_count: 0,
      expected_status: "queued",
      target_lease_seconds: 120,
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(3, "complete_jd_structure", {
      target_run_id: runId,
      target_attempt_count: 1,
      target_jd_translation_zh: "要求熟练使用 SQL。",
      target_requirements: [{
        category: "skill",
        requirementType: "required",
        originalText: "Advanced SQL",
        translationZh: "高级 SQL",
        sourceExcerpt: "Advanced SQL experience is required.",
        allowsEquivalent: false,
        explicitGate: false,
        sortOrder: 0,
        criteria: [{
          groupKey: "g1",
          groupRule: "all",
          kind: "tool",
          originalText: "Advanced SQL",
          translationZh: "高级 SQL",
          constraint: { operator: "exact", value: "SQL", unit: null },
          sortOrder: 0,
        }],
      }],
      target_ai_metadata: ai,
      target_estimated_cost: null,
    });
    expect(JSON.stringify(supabase.rpc.mock.calls[2])).not.toContain('"key"');
    expect(supabase.rpc).toHaveBeenNthCalledWith(4, "fail_jd_structure", {
      target_run_id: runId,
      target_attempt_count: 2,
      target_error_code: "jd-structure-failed",
      target_error_message: "safe",
    });
  });

  it.each(["queued", "running", "succeeded", "failed"] as const)(
    "strictly maps the %s run status",
    async (status) => {
      const result = status === "succeeded" ? runRow({ status }) : runRow({
        status,
        attempt_count: status === "queued" ? 0 : 1,
        jd_translation_zh: null,
        result: null,
        error_code: status === "failed" ? "safe-failure" : null,
        error_message: status === "failed" ? "safe" : null,
        started_at: status === "queued" ? null : timestamp,
        finished_at: status === "failed" ? timestamp : null,
      });
      const supabase = client({ jd_structure_runs: result });
      const repository = createJDStructureRepository(async () => supabase as never);
      await expect(repository.getOwned(userId, runId)).resolves.toMatchObject({ status });
    },
  );

  it("filters all reads by owner and uses deterministic latest ordering", async () => {
    const supabase = client({ jd_structure_runs: runRow() });
    const repository = createJDStructureRepository(async () => supabase as never);
    await repository.getLatestSucceeded(userId, applicationId);
    const queryChain = supabase.queries.get("jd_structure_runs")!;
    expect(queryChain.eq).toHaveBeenCalledWith("user_id", userId);
    expect(queryChain.eq).toHaveBeenCalledWith("application_id", applicationId);
    expect(queryChain.eq).toHaveBeenCalledWith("status", "succeeded");
    expect(queryChain.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(queryChain.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
  });

  it("hydrates requirements and criteria in stable source order with owner filters", async () => {
    const secondRequirementId = "55555555-5555-4555-8555-555555555555";
    const supabase = client({
      jd_structure_requirements: [
        requirementRow({ id: secondRequirementId, sort_order: 1, original_text: "Python" }),
        requirementRow(),
      ],
      jd_structure_criteria: [
        criterionRow({ requirement_id: secondRequirementId, sort_order: 0, original_text: "Python" }),
        criterionRow(),
      ],
    });
    const repository = createJDStructureRepository(async () => supabase as never);
    const result = await repository.listRequirementsWithCriteria(userId, runId);

    expect(result.map((item) => item.originalText)).toEqual(["Advanced SQL", "Python"]);
    expect(result[0]?.criteria[0]).toMatchObject({ id: criterionId, kind: "tool" });
    for (const table of ["jd_structure_requirements", "jd_structure_criteria"]) {
      const chain = supabase.queries.get(table)!;
      expect(chain.eq).toHaveBeenCalledWith("user_id", userId);
      expect(chain.eq).toHaveBeenCalledWith("run_id", runId);
    }
  });

  it("rejects malformed stored JSON and metadata containing source text", async () => {
    const malformed = client({
      jd_structure_runs: runRow({ result: { ...runRow().result as object, jdText: "private JD" } }),
    });
    const repository = createJDStructureRepository(async () => malformed as never);
    await expect(repository.getOwned(userId, runId)).rejects.toMatchObject({
      code: "invalid-stored-jd-structure",
    });

    const invalidCriterion = client({
      jd_structure_requirements: [requirementRow()],
      jd_structure_criteria: [criterionRow({ constraint_payload: { operator: "bogus", value: null, unit: null } })],
    });
    const second = createJDStructureRepository(async () => invalidCriterion as never);
    await expect(second.listRequirementsWithCriteria(userId, runId)).rejects.toMatchObject({
      code: "invalid-stored-jd-structure-criterion",
    });
  });
});
