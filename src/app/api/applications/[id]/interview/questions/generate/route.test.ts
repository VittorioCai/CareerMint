// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  application: "11111111-1111-4111-8111-111111111111",
  run: "22222222-2222-4222-8222-222222222222",
};

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getApplication: vi.fn(),
  getAIProcessingConsentAt: vi.fn(),
  listRequirements: vi.fn(),
  listInterviewQuestions: vi.fn(),
  createOrGet: vi.fn(),
  claim: vi.fn(),
  getOwned: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  createDeepSeekAIProvider: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/features/account/repository", () => ({
  getAIProcessingConsentAt: mocks.getAIProcessingConsentAt,
}));
vi.mock("@/features/applications/repository", () => ({
  applicationRepository: { get: mocks.getApplication },
}));
vi.mock("@/features/jd-analysis/repository", () => ({
  jdAnalysisRepository: { listRequirements: mocks.listRequirements },
}));
vi.mock("@/features/interview-preparation/repository", () => ({
  interviewPreparationRepository: { list: mocks.listInterviewQuestions },
}));
vi.mock("@/features/interview-preparation/generation-repository", () => ({
  interviewQuestionGenerationRepository: {
    createOrGet: mocks.createOrGet,
    claim: mocks.claim,
    getOwned: mocks.getOwned,
    complete: mocks.complete,
    fail: mocks.fail,
  },
}));
vi.mock("@/features/extraction/deepseek-extractor", () => ({
  createDeepSeekAIProvider: mocks.createDeepSeekAIProvider,
}));

const queuedRun = {
  id: ids.run,
  applicationId: ids.application,
  userId: ids.user,
  inputHash: "a".repeat(64),
  schemaVersion: "interview-question-generation-v1",
  provider: "fake",
  model: "fake-interview-question-generator-v1",
  status: "queued" as const,
  attemptCount: 0,
  result: null,
  errorCode: null,
  errorMessage: null,
  requestId: null,
  updatedAt: "2026-08-21T12:00:00.000Z",
  createdAt: "2026-08-21T12:00:00.000Z",
};

const runningRun = { ...queuedRun, status: "running" as const, attemptCount: 1 };
const succeededRun = {
  ...runningRun,
  status: "succeeded" as const,
  result: {
    acceptedCandidateCount: 0,
    rejectedCandidateCount: 0,
    pendingCandidateCount: 1,
    ai: {
      provider: "fake",
      model: "fake-interview-question-generator-v1",
      requestId: null,
      usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 0, outputTokens: 0 },
      priceScheduleVersion: null,
    },
    estimatedCost: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerEnv.mockReturnValue({
    AI_TEXT_PROVIDER: "deepseek",
    AI_TEXT_MODEL: "deepseek-v4-flash",
    E2E_FAKE_EXTRACTOR: "1",
    DEEPSEEK_API_KEY: "test-key",
    AI_PRICE_SCHEDULE_JSON: undefined,
  });
  mocks.getCurrentUser.mockResolvedValue({ id: ids.user });
  mocks.getApplication.mockResolvedValue({
    id: ids.application,
    userId: ids.user,
    jdText: "Build reliable systems with advanced SQL experience.",
  });
  mocks.getAIProcessingConsentAt.mockResolvedValue("2026-08-21T10:00:00.000Z");
  mocks.listRequirements.mockResolvedValue([]);
  mocks.listInterviewQuestions.mockResolvedValue([]);
  mocks.createOrGet.mockResolvedValue(queuedRun);
  mocks.claim.mockResolvedValue(true);
  mocks.getOwned.mockResolvedValue(runningRun);
  mocks.complete.mockResolvedValue(succeededRun);
  mocks.fail.mockResolvedValue({ ...runningRun, status: "failed" as const });
});

describe("interview generation route wiring", () => {
  it("runs the real POST handler and service wiring with the non-production fake", async () => {
    const route = await import("./route");

    expect(route.runtime).toBe("nodejs");
    const response = await route.POST(
      new Request("http://test"),
      { params: Promise.resolve({ id: ids.application }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId: ids.run,
      status: "succeeded",
      reused: false,
    });
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.createOrGet).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: ids.application,
        provider: "fake",
        model: "fake-interview-question-generator-v1",
      }),
    );
    expect(mocks.claim).toHaveBeenCalledWith(ids.run, 0, "queued");
    expect(mocks.getOwned).toHaveBeenCalledWith(ids.user, ids.run);
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedAttemptCount: 1,
        aiUsage: expect.objectContaining({
          provider: "fake",
          model: "fake-interview-question-generator-v1",
        }),
      }),
    );
    expect(mocks.createDeepSeekAIProvider).not.toHaveBeenCalled();
  });

  it("returns a durable succeeded run without invoking orchestration", async () => {
    mocks.createOrGet.mockResolvedValue(succeededRun);
    const route = await import("./route");

    const response = await route.POST(
      new Request("http://test"),
      { params: Promise.resolve({ id: ids.application }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId: ids.run,
      status: "succeeded",
      reused: true,
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
