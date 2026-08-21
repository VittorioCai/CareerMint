// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  dependencies: null as Record<string, unknown> | null,
  post: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: vi.fn(() => ({
    AI_TEXT_PROVIDER: "deepseek",
    AI_TEXT_MODEL: "deepseek-v4-flash",
    E2E_FAKE_EXTRACTOR: "1",
    DEEPSEEK_API_KEY: "test-key",
    AI_PRICE_SCHEDULE_JSON: undefined,
  })),
}));
vi.mock("@/features/interview-preparation/generation-http", () => ({
  createInterviewQuestionGenerationPostHandler: (dependencies: Record<string, unknown>) => {
    harness.dependencies = dependencies;
    return harness.post;
  },
}));
vi.mock("@/lib/auth/require-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/features/account/repository", () => ({ getAIProcessingConsentAt: vi.fn() }));
vi.mock("@/features/applications/repository", () => ({ applicationRepository: { get: vi.fn() } }));
vi.mock("@/features/jd-analysis/repository", () => ({ jdAnalysisRepository: { listRequirements: vi.fn() } }));
vi.mock("@/features/interview-preparation/repository", () => ({
  interviewPreparationRepository: { list: vi.fn() },
}));
vi.mock("@/features/interview-preparation/generation-repository", () => ({
  interviewQuestionGenerationRepository: {},
}));
vi.mock("@/features/interview-preparation/generation-service", () => ({
  createInterviewQuestionGenerationService: vi.fn(),
}));
vi.mock("@/features/extraction/deepseek-extractor", () => ({
  createDeepSeekAIProvider: vi.fn(),
}));

describe("interview generation route wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.dependencies = null;
    harness.post.mockReset();
  });

  it("initializes the Node POST route with a lazy fake provider factory", async () => {
    const route = await import("./route");

    expect(route.runtime).toBe("nodejs");
    expect(route.POST).toBe(harness.post);
    expect(harness.dependencies?.providerConfig).toEqual({
      provider: "fake",
      model: "fake-interview-question-generator-v1",
    });
    const providerFactory = harness.dependencies?.providerFactory as () => unknown;
    expect(providerFactory).toEqual(expect.any(Function));
    expect(() => providerFactory()).not.toThrow();
  });
});
