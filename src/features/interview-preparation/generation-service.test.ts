// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createInterviewQuestionGenerationService } from "./generation-service";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "aaaaaaaa-1111-4111-8111-111111111111";
const runId = "aaaaaaaa-2222-4222-8222-222222222222";
const jdText =
  "Lead product discovery across international markets. Advanced SQL experience is required.";

const run = {
  id: runId,
  applicationId,
  userId,
  inputHash: "a".repeat(64),
  schemaVersion: "interview-question-generation-v1",
  provider: "test-provider",
  model: "test-model",
  status: "queued" as const,
  attemptCount: 0,
  result: null,
  errorCode: null,
  errorMessage: null,
  requestId: null,
  updatedAt: "2026-08-21T12:00:00.000Z",
  createdAt: "2026-08-21T12:00:00.000Z",
};

const candidate = {
  category: "function" as const,
  prompt: "How would you use SQL to guide product discovery?",
  sourceExcerpt: "Advanced SQL experience is required.",
  relevanceReason: "The role explicitly requires advanced SQL experience.",
};

const aiResult = {
  data: { questions: [candidate] },
  provider: "test-provider",
  model: "test-model",
  requestId: "request-123",
  usage: {
    inputCacheHitTokens: 10,
    inputCacheMissTokens: 20,
    outputTokens: 30,
  },
};

const schedule = {
  version: "synthetic-v1",
  provider: "test-provider",
  model: "test-model",
  currency: "USD" as const,
  observedAt: "2026-08-01T00:00:00.000Z",
  sourceUrl: "https://example.com/pricing",
  effectiveFrom: "2026-08-02T00:00:00.000Z",
  effectiveUntil: "2026-09-01T00:00:00.000Z",
  defaultRates: {
    inputCacheHitPerMillion: 1,
    inputCacheMissPerMillion: 2,
    outputPerMillion: 3,
  },
  peak: null,
};

function fakes() {
  const runs = {
    claim: vi.fn().mockResolvedValue(true),
    getOwned: vi.fn().mockResolvedValue({
      ...run,
      status: "running" as const,
      attemptCount: 1,
    }),
    complete: vi.fn().mockImplementation(async (input) => ({
      ...run,
      status: "succeeded" as const,
      result: {
        acceptedCandidateCount: 0,
        rejectedCandidateCount: input.rejectedCandidateCount,
        pendingCandidateCount: input.candidates.length,
        ai: input.aiUsage,
        estimatedCost: input.estimatedCost,
      },
    })),
    fail: vi.fn().mockImplementation(async (input) => ({
      ...run,
      status: "failed" as const,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      updatedAt: "2026-08-21T12:00:00.000Z",
    })),
  };
  const provider = { generateInterviewQuestions: vi.fn().mockResolvedValue(aiResult) };
  const providerFactory = vi.fn().mockReturnValue(provider);
  return { runs, provider, providerFactory };
}

const baseInput = {
  userId,
  run,
  application: { id: applicationId, jdText },
  requirements: [
    {
      id: "req-1",
      category: "skill",
      text: "Advanced SQL",
      sourceExcerpt: "Advanced SQL experience is required.",
      priority: "core",
    },
  ],
  commonPrompts: ["Tell me about yourself"],
};

describe("interview question generation service", () => {
  it("claims before calling the provider and completes with exact rejected count and cost", async () => {
    const dependencies = fakes();
    const service = createInterviewQuestionGenerationService({
      ...dependencies,
      providerFactory: dependencies.providerFactory,
      priceSchedule: schedule,
      clock: () => new Date("2026-08-21T12:00:00.000Z"),
    });

    await service.run(baseInput);

    expect(dependencies.runs.claim).toHaveBeenCalledExactlyOnceWith(
      runId,
      0,
      "queued",
    );
    expect(
      dependencies.runs.claim.mock.invocationCallOrder[0],
    ).toBeLessThan(
      dependencies.provider.generateInterviewQuestions.mock.invocationCallOrder[0],
    );
    expect(dependencies.runs.complete).toHaveBeenCalledWith({
      runId,
      expectedAttemptCount: 1,
      candidates: [candidate],
      rejectedCandidateCount: 0,
      aiUsage: {
        provider: "test-provider",
        model: "test-model",
        requestId: "request-123",
        usage: aiResult.usage,
        priceScheduleVersion: "synthetic-v1",
      },
      estimatedCost: {
        amount: 0.00014,
        currency: "USD",
        scheduleVersion: "synthetic-v1",
        tier: "default",
      },
      requestId: "request-123",
    });
  });

  it("returns the owned run without calling the provider when claim loses", async () => {
    const dependencies = fakes();
    dependencies.runs.claim.mockResolvedValue(false);
    dependencies.runs.getOwned.mockResolvedValue({ ...run, status: "running" });
    const service = createInterviewQuestionGenerationService(dependencies);

    await expect(service.run(baseInput)).resolves.toMatchObject({
      run: { status: "running" },
      reused: true,
    });
    expect(dependencies.provider.generateInterviewQuestions).not.toHaveBeenCalled();
  });

  it("fails once with a safe message when schema-valid output has no grounded candidate", async () => {
    const dependencies = fakes();
    dependencies.provider.generateInterviewQuestions.mockResolvedValue({
      ...aiResult,
      data: { questions: [{ ...candidate, sourceExcerpt: "Invented excerpt" }] },
    });
    const service = createInterviewQuestionGenerationService(dependencies);

    await service.run(baseInput);

    expect(dependencies.provider.generateInterviewQuestions).toHaveBeenCalledTimes(1);
    expect(dependencies.runs.fail).toHaveBeenCalledExactlyOnceWith({
      runId,
      expectedAttemptCount: 1,
      errorCode: "interview-question-generation-invalid-output",
      errorMessage: "岗位面试题生成失败，请稍后重试。",
      requestId: "request-123",
    });
    expect(JSON.stringify(dependencies.runs.fail.mock.calls)).not.toContain(jdText);
  });

  it("maps sanitizer ZodError to the fixed invalid-output failure without leaking validation details", async () => {
    const dependencies = fakes();
    dependencies.provider.generateInterviewQuestions.mockResolvedValue({
      ...aiResult,
      data: { questions: [{ category: "function", prompt: "too short" }] },
    });
    const service = createInterviewQuestionGenerationService(dependencies);

    await expect(service.run(baseInput)).resolves.toMatchObject({
      run: { status: "failed" },
    });

    expect(dependencies.runs.fail).toHaveBeenCalledExactlyOnceWith({
      runId,
      expectedAttemptCount: 1,
      errorCode: "interview-question-generation-invalid-output",
      errorMessage: "岗位面试题生成失败，请稍后重试。",
      requestId: "request-123",
    });
    const failurePayload = JSON.stringify(dependencies.runs.fail.mock.calls);
    expect(failurePayload).not.toContain(jdText);
    expect(failurePayload).not.toContain("issues");
    expect(failurePayload).not.toContain("too short");
  });

  it("passes partial valid output and its rejected count to completion", async () => {
    const dependencies = fakes();
    dependencies.provider.generateInterviewQuestions.mockResolvedValue({
      ...aiResult,
      data: {
        questions: [candidate, { ...candidate, prompt: "What invented fact matters?", sourceExcerpt: "Invented" }],
      },
    });
    const service = createInterviewQuestionGenerationService(dependencies);

    await service.run(baseInput);

    expect(dependencies.runs.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rejectedCandidateCount: 1, candidates: [candidate] }),
    );
  });

  it("maps provider failures to the allowlisted safe provider error", async () => {
    const dependencies = fakes();
    dependencies.provider.generateInterviewQuestions.mockRejectedValue(
      new Error(`provider failed: ${jdText}`),
    );
    const service = createInterviewQuestionGenerationService(dependencies);

    await service.run(baseInput);

    expect(dependencies.runs.fail).toHaveBeenCalledWith({
      runId,
      expectedAttemptCount: 1,
      errorCode: "interview-question-generation-provider-error",
      errorMessage: "岗位面试题生成失败，请稍后重试。",
      requestId: null,
    });
    expect(JSON.stringify(dependencies.runs.fail.mock.calls)).not.toContain(jdText);
  });

  it("trims and allowlists request ids before complete", async () => {
    const dependencies = fakes();
    dependencies.provider.generateInterviewQuestions.mockResolvedValue({
      ...aiResult,
      requestId: "  request-123  ",
    });
    const service = createInterviewQuestionGenerationService({
      ...dependencies,
      providerFactory: dependencies.providerFactory,
    });

    await service.run(baseInput);

    expect(dependencies.runs.complete).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "request-123" }),
    );
  });

  it("drops unsafe request ids before a safe failure", async () => {
    const dependencies = fakes();
    dependencies.provider.generateInterviewQuestions.mockResolvedValue({
      ...aiResult,
      requestId: ` ${"x".repeat(201)} `,
      data: { questions: [{ ...candidate, sourceExcerpt: "Invented" }] },
    });
    const service = createInterviewQuestionGenerationService({
      ...dependencies,
      providerFactory: dependencies.providerFactory,
    });

    await service.run(baseInput);

    expect(dependencies.runs.fail).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: null }),
    );
  });

  it("returns succeeded when completion committed but its response was lost", async () => {
    const dependencies = fakes();
    dependencies.runs.complete.mockRejectedValue(new Error("response-lost"));
    dependencies.runs.getOwned
      .mockResolvedValueOnce({ ...run, status: "running", attemptCount: 1 })
      .mockResolvedValueOnce({ ...run, status: "succeeded", attemptCount: 1 });
    const service = createInterviewQuestionGenerationService({
      ...dependencies,
      providerFactory: dependencies.providerFactory,
    });

    await expect(service.run(baseInput)).resolves.toMatchObject({
      run: { status: "succeeded" },
    });
    expect(dependencies.runs.fail).not.toHaveBeenCalled();
  });

  it("returns failed when failure committed but its response was lost", async () => {
    const dependencies = fakes();
    dependencies.provider.generateInterviewQuestions.mockRejectedValue(
      new Error("provider-down"),
    );
    dependencies.runs.fail.mockRejectedValue(new Error("response-lost"));
    dependencies.runs.getOwned
      .mockResolvedValueOnce({ ...run, status: "running", attemptCount: 1 })
      .mockResolvedValueOnce({ ...run, status: "failed", attemptCount: 1 });
    const service = createInterviewQuestionGenerationService({
      ...dependencies,
      providerFactory: dependencies.providerFactory,
    });

    await expect(service.run(baseInput)).resolves.toMatchObject({
      run: { status: "failed" },
    });
  });

  it("does not construct a provider for a superseded claim", async () => {
    const dependencies = fakes();
    dependencies.runs.getOwned.mockResolvedValue({
      ...run,
      status: "running",
      attemptCount: 2,
    });
    const service = createInterviewQuestionGenerationService({
      ...dependencies,
      providerFactory: dependencies.providerFactory,
    });

    await service.run(baseInput);

    expect(dependencies.providerFactory).not.toHaveBeenCalled();
    expect(dependencies.provider.generateInterviewQuestions).not.toHaveBeenCalled();
  });

  it("turns provider factory failure into one safe failure", async () => {
    const dependencies = fakes();
    dependencies.providerFactory.mockImplementation(() => {
      throw new Error("factory failed: secret provider response");
    });
    const service = createInterviewQuestionGenerationService({
      ...dependencies,
      providerFactory: dependencies.providerFactory,
    });

    await expect(service.run(baseInput)).resolves.toMatchObject({
      run: { status: "failed" },
    });
    expect(dependencies.runs.fail).toHaveBeenCalledExactlyOnceWith({
      runId,
      expectedAttemptCount: 1,
      errorCode: "interview-question-generation-provider-error",
      errorMessage: "岗位面试题生成失败，请稍后重试。",
      requestId: null,
    });
  });
});
