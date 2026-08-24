// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createJDAnalysisService } from "./service";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "aaaaaaaa-1111-4111-8111-111111111111";
const runId = "aaaaaaaa-2222-4222-8222-222222222222";
const factId = "11111111-1111-4111-8111-111111111111";
const jdText =
  "Lead product discovery across international markets. Advanced SQL experience is required.";

const run = {
  id: runId,
  applicationId,
  userId,
  inputHash: "a".repeat(64),
  provider: "test-provider",
  model: "test-model",
  status: "queued" as const,
  attemptCount: 0,
  result: null,
  errorCode: null,
  createdAt: "2026-08-14T12:00:00.000Z",
};

const confirmedFacts = [
  {
    id: factId,
    factType: "achievement" as const,
    title: "Checkout conversion improvement",
    organization: "Acme GmbH",
    description: "Improved checkout conversion by 18%.",
    skills: ["SQL"],
    sourceExcerpt: "Improved checkout conversion by 18%.",
  },
];

const syntheticSchedule = {
  version: "synthetic-v1",
  provider: "test-provider",
  model: "test-model",
  currency: "USD" as const,
  observedAt: "2026-08-01T00:00:00.000Z",
  sourceUrl: "https://example.com/official-pricing",
  effectiveFrom: "2026-08-02T00:00:00.000Z",
  effectiveUntil: "2026-09-01T00:00:00.000Z",
  defaultRates: {
    inputCacheHitPerMillion: 1,
    inputCacheMissPerMillion: 2,
    outputPerMillion: 3,
  },
  peak: null,
};

function createFakes() {
  const runs = {
    claim: vi.fn().mockResolvedValue(true),
    getOwned: vi.fn().mockResolvedValue(run),
    complete: vi.fn().mockImplementation(async (input) => ({
      ...run,
      status: "succeeded",
      result: {
        acceptedRequirementCount: input.requirements.length,
        rejectedRequirementCount: input.rejectedRequirementCount,
        rejectedEvidenceCount: input.rejectedEvidenceCount,
        jdTranslationZh: input.jdTranslationZh,
        translationAvailable: true,
        ai: input.aiUsage,
        estimatedCost: input.estimatedCost,
      },
    })),
    fail: vi.fn().mockImplementation(async (input) => ({
      ...run,
      status: "failed",
      errorCode: input.errorCode,
    })),
  };
  const provider = {
    analyzeJobDescription: vi.fn().mockResolvedValue({
      data: {
        jdTranslationZh:
          "在国际市场推动产品探索。要求具备高级 SQL 经验。",
        requirements: [
          {
            category: "skill",
            text: "Advanced SQL",
            translationZh: "高级 SQL",
            sourceExcerpt: "Advanced SQL experience is required.",
            priority: "core",
            matchStatus: "evidence",
            matchReason: "The confirmed achievement lists SQL.",
            matchedFactIds: [factId],
          },
          {
            category: "responsibility",
            text: "Invented budget ownership",
            translationZh: "虚构的预算管理职责",
            sourceExcerpt: "Own a €50M budget.",
            priority: "core",
            matchStatus: "evidence",
            matchReason: "Invented",
            matchedFactIds: [factId],
          },
        ],
      },
      provider: "test-provider",
      model: "test-model",
      requestId: "request-123",
      usage: {
        inputCacheHitTokens: 10,
        inputCacheMissTokens: 20,
        outputTokens: 30,
      },
    }),
  };
  return { runs, provider };
}

describe("JD analysis service", () => {
  it("claims once, filters unsupported evidence, and persists safe metadata", async () => {
    const fakes = createFakes();
    const service = createJDAnalysisService({
      ...fakes,
      priceSchedule: syntheticSchedule,
      clock: () => new Date("2026-08-14T12:00:00.000Z"),
    });

    const completed = await service.run({
      userId,
      run,
      application: { id: applicationId, jdText },
      confirmedFacts,
    });

    expect(fakes.runs.claim).toHaveBeenCalledExactlyOnceWith(runId);
    expect(fakes.provider.analyzeJobDescription).toHaveBeenCalledWith({
      jdText,
      confirmedFacts,
    });
    expect(fakes.runs.complete).toHaveBeenCalledWith({
      runId,
      jdTranslationZh:
        "在国际市场推动产品探索。要求具备高级 SQL 经验。",
      requirements: [
        expect.objectContaining({
          text: "Advanced SQL",
          matchedFactIds: [factId],
        }),
      ],
      rejectedRequirementCount: 1,
      rejectedEvidenceCount: 0,
      aiUsage: {
        provider: "test-provider",
        model: "test-model",
        requestId: "request-123",
        usage: {
          inputCacheHitTokens: 10,
          inputCacheMissTokens: 20,
          outputTokens: 30,
        },
        priceScheduleVersion: "synthetic-v1",
      },
      estimatedCost: {
        amount: 0.00014,
        currency: "USD",
        scheduleVersion: "synthetic-v1",
        tier: "default",
      },
    });
    expect(completed.status).toBe("succeeded");
    expect(JSON.stringify(completed.result)).not.toContain(jdText);
    expect(JSON.stringify(completed.result)).not.toContain(
      confirmedFacts[0].description,
    );
  });

  it("returns the current run when another request already claimed it", async () => {
    const fakes = createFakes();
    fakes.runs.claim.mockResolvedValue(false);
    fakes.runs.getOwned.mockResolvedValue({ ...run, status: "running" });
    const service = createJDAnalysisService(fakes);

    await expect(
      service.run({
        userId,
        run,
        application: { id: applicationId, jdText },
        confirmedFacts,
      }),
    ).resolves.toMatchObject({ status: "running" });

    expect(fakes.runs.getOwned).toHaveBeenCalledWith(userId, runId);
    expect(fakes.provider.analyzeJobDescription).not.toHaveBeenCalled();
    expect(fakes.runs.complete).not.toHaveBeenCalled();
  });

  it("records a sanitized retryable failure without source content", async () => {
    const fakes = createFakes();
    fakes.provider.analyzeJobDescription.mockRejectedValue(
      new Error(`jd-analysis-invalid-output: ${jdText}`),
    );
    const service = createJDAnalysisService(fakes);

    const failed = await service.run({
      userId,
      run,
      application: { id: applicationId, jdText },
      confirmedFacts,
    });

    expect(fakes.runs.fail).toHaveBeenCalledWith({
      runId,
      errorCode: "jd-analysis-failed",
      errorMessage: "岗位分析失败，请稍后重试。",
    });
    expect(JSON.stringify(fakes.runs.fail.mock.calls)).not.toContain(jdText);
    expect(failed.status).toBe("failed");
  });

  it("turns a missing production API key into a stable unavailable state", async () => {
    const fakes = createFakes();
    fakes.provider.analyzeJobDescription.mockRejectedValue(
      new Error("deepseek-api-key-missing"),
    );
    const service = createJDAnalysisService(fakes);

    await service.run({
      userId,
      run,
      application: { id: applicationId, jdText },
      confirmedFacts,
    });

    expect(fakes.runs.fail).toHaveBeenCalledWith({
      runId,
      errorCode: "jd-analysis-unavailable",
      errorMessage: "岗位分析暂不可用，JD 已安全保留。",
    });
  });
});
