// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createJDStructureService } from "./structure-service";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-25T00:00:00.000Z";
const jdText = "The candidate must have advanced SQL experience for analytics work.";

const run = {
  id: runId,
  applicationId,
  userId,
  jdSha256: "a".repeat(64),
  inputHash: "b".repeat(64),
  provider: "deepseek",
  model: "deepseek-chat",
  schemaVersion: "jd-analysis-v3",
  promptVersion: "jd-structure-v3.1",
  status: "queued" as const,
  attemptCount: 0,
  jdTranslationZh: null,
  result: null,
  errorCode: null,
  errorMessage: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  startedAt: null,
  finishedAt: null,
};

const providerOutput = {
  jdTranslationZh: "候选人必须具备用于分析工作的高级 SQL 经验。",
  requirements: [{
    key: "r1",
    category: "skill" as const,
    requirementType: "required" as const,
    originalText: "advanced SQL experience",
    translationZh: "高级 SQL 经验",
    sourceExcerpt: "must have advanced SQL experience",
    allowsEquivalent: false,
    explicitGate: false,
    criteria: [{
      key: "c1",
      groupKey: "g1",
      groupRule: "all" as const,
      kind: "tool" as const,
      originalText: "advanced SQL",
      translationZh: "高级 SQL",
      constraint: { operator: "exact" as const, value: "SQL", unit: null },
    }],
  }],
};

function succeeded(overrides: Record<string, unknown> = {}) {
  return {
    ...run,
    status: "succeeded" as const,
    attemptCount: 1,
    jdTranslationZh: providerOutput.jdTranslationZh,
    result: {
      requirementCount: 1,
      criterionCount: 1,
      translationAvailable: true,
      ai: {
        provider: "deepseek",
        model: "deepseek-chat",
        requestId: null,
        usage: { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3 },
        priceScheduleVersion: null,
      },
      estimatedCost: null,
    },
    startedAt: timestamp,
    finishedAt: timestamp,
    ...overrides,
  };
}

function dependencies() {
  const claimed = { ...run, status: "running" as const, attemptCount: 1, startedAt: timestamp };
  const provider = {
    structureJobDescription: vi.fn().mockResolvedValue({
      data: providerOutput,
      provider: "deepseek",
      model: "deepseek-chat",
      requestId: "req-1",
      usage: { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3 },
    }),
  };
  return {
    runs: {
      claim: vi.fn().mockResolvedValue(true),
      getOwned: vi.fn().mockResolvedValue(claimed),
      complete: vi.fn().mockResolvedValue(succeeded()),
      fail: vi.fn().mockImplementation(async (input: { errorCode: string; errorMessage: string }) => ({
        ...claimed,
        status: "failed" as const,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        finishedAt: timestamp,
      })),
    },
    provider,
    providerFactory: vi.fn().mockReturnValue(provider),
    priceSchedule: undefined as import("@/features/ai/pricing").AIPriceSchedule | undefined,
    clock: () => new Date(timestamp),
  };
}

describe("JD structure service", () => {
  it.each([
    ["run owner", { run: { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }],
    ["application owner", { application: { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }],
    ["application id", { application: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } }],
  ] as const)("rejects a wrong %s before claim or provider construction", async (_label, change) => {
    const fakes = dependencies();
    await expect(createJDStructureService(fakes).run({
      userId,
      run: { ...run, ...(change as { run?: Partial<typeof run> }).run },
      application: {
        id: applicationId,
        userId,
        jdText,
        ...(change as { application?: Record<string, string> }).application,
      },
    })).rejects.toThrow("application-not-found");
    expect(fakes.runs.claim).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
  });

  it("reuses an existing succeeded run without a claim or provider", async () => {
    const fakes = dependencies();
    const result = await createJDStructureService(fakes).run({
      userId,
      run: succeeded(),
      application: { id: applicationId, userId, jdText },
    });
    expect(result).toMatchObject({ reused: true, run: { status: "succeeded" } });
    expect(fakes.runs.claim).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
  });

  it("uses a fenced claim, then constructs and calls the provider exactly once", async () => {
    const fakes = dependencies();
    const result = await createJDStructureService(fakes).run({
      userId,
      run,
      application: { id: applicationId, userId, jdText },
    });
    expect(result.reused).toBe(false);
    expect(fakes.runs.claim).toHaveBeenCalledWith(runId, 0, "queued", 120);
    expect(fakes.runs.getOwned).toHaveBeenCalledWith(userId, runId);
    expect(fakes.providerFactory).toHaveBeenCalledTimes(1);
    expect(fakes.provider.structureJobDescription).toHaveBeenCalledTimes(1);
    expect(fakes.provider.structureJobDescription).toHaveBeenCalledWith({ jdText });
    expect(fakes.runs.complete).toHaveBeenCalledWith(expect.objectContaining({
      runId,
      expectedAttemptCount: 1,
      output: providerOutput,
    }));
  });

  it("does not process when the claim is lost or the reread belongs to a newer attempt", async () => {
    const fakes = dependencies();
    fakes.runs.claim.mockResolvedValueOnce(false);
    fakes.runs.getOwned.mockResolvedValueOnce({ ...run, status: "running", attemptCount: 1 });
    const first = await createJDStructureService(fakes).run({
      userId,
      run,
      application: { id: applicationId, userId, jdText },
    });
    expect(first.reused).toBe(true);
    expect(fakes.providerFactory).not.toHaveBeenCalled();

    const next = dependencies();
    next.runs.getOwned.mockResolvedValueOnce({ ...run, status: "running", attemptCount: 2 });
    const second = await createJDStructureService(next).run({
      userId,
      run,
      application: { id: applicationId, userId, jdText },
    });
    expect(second.reused).toBe(true);
    expect(next.providerFactory).not.toHaveBeenCalled();
  });

  it("fails invalid ungrounded output once with a stable code", async () => {
    const fakes = dependencies();
    fakes.provider.structureJobDescription.mockResolvedValueOnce({
      data: {
        ...providerOutput,
        requirements: [{ ...providerOutput.requirements[0], sourceExcerpt: "not present in JD" }],
      },
      provider: "deepseek",
      model: "deepseek-chat",
      requestId: null,
      usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 0, outputTokens: 0 },
    });
    const result = await createJDStructureService(fakes).run({
      userId,
      run,
      application: { id: applicationId, userId, jdText },
    });
    expect(result.run).toMatchObject({ status: "failed", errorCode: "jd-structure-invalid-output" });
    expect(fakes.provider.structureJobDescription).toHaveBeenCalledTimes(1);
    expect(fakes.runs.complete).not.toHaveBeenCalled();
  });

  it("records only bounded AI/cost metadata", async () => {
    const fakes = dependencies();
    fakes.priceSchedule = {
      version: "deepseek-2026-08",
      provider: "deepseek",
      model: "deepseek-chat",
      currency: "USD",
      observedAt: "2026-08-20T00:00:00.000Z",
      sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveUntil: null,
      defaultRates: { inputCacheHitPerMillion: 0.01, inputCacheMissPerMillion: 0.1, outputPerMillion: 0.2 },
      peak: null,
    };
    await createJDStructureService(fakes).run({
      userId,
      run,
      application: { id: applicationId, userId, jdText },
    });
    const completion = fakes.runs.complete.mock.calls[0][0];
    expect(completion.ai).toMatchObject({
      provider: "deepseek",
      model: "deepseek-chat",
      requestId: "req-1",
      priceScheduleVersion: "deepseek-2026-08",
    });
    expect(completion.estimatedCost).toMatchObject({ currency: "USD", scheduleVersion: "deepseek-2026-08" });
    expect(JSON.stringify({ ai: completion.ai, estimatedCost: completion.estimatedCost })).not.toContain(jdText);
  });

  it.each([
    ["deepseek-api-key-missing", "jd-gap-unavailable"],
    ["ai-provider-authentication-failed", "jd-gap-unavailable"],
    ["ai-provider-rate-limited", "ai-provider-rate-limited"],
    ["private provider body", "jd-gap-failed"],
  ] as const)("maps %s to the stable failure %s", async (message, expected) => {
    const fakes = dependencies();
    fakes.provider.structureJobDescription.mockRejectedValueOnce(new Error(message));
    const result = await createJDStructureService(fakes).run({
      userId,
      run,
      application: { id: applicationId, userId, jdText },
    });
    expect(result.run.errorCode).toBe(expected);
    expect(result.run.errorMessage).not.toContain(message);
  });

  it("preserves a preceding success when completion loses a write race", async () => {
    const fakes = dependencies();
    fakes.runs.complete.mockRejectedValueOnce(new Error("stale write"));
    fakes.runs.getOwned
      .mockResolvedValueOnce({ ...run, status: "running", attemptCount: 1 })
      .mockResolvedValueOnce(succeeded({ attemptCount: 2 }));
    const result = await createJDStructureService(fakes).run({
      userId,
      run,
      application: { id: applicationId, userId, jdText },
    });
    expect(result).toMatchObject({ reused: true, run: { status: "succeeded", attemptCount: 2 } });
    expect(fakes.runs.fail).not.toHaveBeenCalled();
  });
});
