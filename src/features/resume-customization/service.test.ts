// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createResumeGenerationService } from "./service";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "aaaaaaaa-1111-4111-8111-111111111111";
const runId = "aaaaaaaa-2222-4222-8222-222222222222";
const factId = "11111111-1111-4111-8111-111111111111";
const foreignFactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requirementId = "33333333-3333-4333-8333-333333333333";
const jdText = "Advanced SQL experience is required for funnel analysis.";

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

const requirements = [
  {
    id: requirementId,
    category: "skill" as const,
    text: "Advanced SQL",
    priority: "core" as const,
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
        acceptedSuggestionCount: input.suggestions.length,
        rejectedSuggestionCount: input.rejectedSuggestionCount,
        rejectedReferenceCount: input.rejectedReferenceCount,
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
    generateResumeSuggestions: vi.fn().mockResolvedValue({
      data: {
        suggestions: [
          {
            section: "achievement",
            content:
              "Improved checkout conversion by 18% through SQL-led funnel analysis.",
            reason: "Directly supports the core SQL requirement.",
            factIds: [factId],
            requirementIds: [requirementId],
          },
          {
            section: "experience",
            content: "Led a global product organization.",
            reason: "Unsupported leadership claim.",
            factIds: [foreignFactId],
            requirementIds: [requirementId],
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

describe("resume generation service", () => {
  it("claims once, filters unsupported suggestions, and persists safe metadata", async () => {
    const fakes = createFakes();
    const service = createResumeGenerationService({
      ...fakes,
      priceSchedule: syntheticSchedule,
      clock: () => new Date("2026-08-14T12:00:00.000Z"),
    });

    const completed = await service.run({
      userId,
      run,
      application: { id: applicationId, jdText },
      confirmedFacts,
      requirements,
    });

    expect(fakes.runs.claim).toHaveBeenCalledExactlyOnceWith(runId);
    expect(fakes.provider.generateResumeSuggestions).toHaveBeenCalledWith({
      jdText,
      confirmedFacts,
      requirements,
    });
    expect(fakes.runs.complete).toHaveBeenCalledWith({
      runId,
      suggestions: [
        expect.objectContaining({
          section: "achievement",
          factIds: [factId],
          requirementIds: [requirementId],
        }),
      ],
      rejectedSuggestionCount: 1,
      rejectedReferenceCount: 1,
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

  it("does not call the provider when another request already claimed the run", async () => {
    const fakes = createFakes();
    fakes.runs.claim.mockResolvedValue(false);
    fakes.runs.getOwned.mockResolvedValue({ ...run, status: "running" });
    const service = createResumeGenerationService(fakes);

    await expect(
      service.run({
        userId,
        run,
        application: { id: applicationId, jdText },
        confirmedFacts,
        requirements,
      }),
    ).resolves.toMatchObject({ status: "running" });

    expect(fakes.provider.generateResumeSuggestions).not.toHaveBeenCalled();
    expect(fakes.runs.complete).not.toHaveBeenCalled();
  });

  it("turns a missing production key into a safe unavailable state", async () => {
    const fakes = createFakes();
    fakes.provider.generateResumeSuggestions.mockRejectedValue(
      new Error("deepseek-api-key-missing"),
    );
    const service = createResumeGenerationService(fakes);

    await service.run({
      userId,
      run,
      application: { id: applicationId, jdText },
      confirmedFacts,
      requirements,
    });

    expect(fakes.runs.fail).toHaveBeenCalledWith({
      runId,
      errorCode: "resume-generation-unavailable",
      errorMessage: "简历建议暂不可用，现有版本和事实都已安全保留。",
    });
  });
});
