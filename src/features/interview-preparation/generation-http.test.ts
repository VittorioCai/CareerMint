// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildInterviewQuestionGenerationInputHash,
  createInterviewQuestionGenerationPostHandler,
} from "./generation-http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const application = {
  id: applicationId,
  userId,
  jdText: "Build reliable systems. Advanced SQL experience is required.",
};
const requirements = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    category: "skill",
    text: "Advanced SQL",
    sourceExcerpt: "Advanced SQL experience is required.",
    priority: "core",
  },
];
const run = {
  id: runId,
  applicationId,
  userId,
  inputHash: "a".repeat(64),
  schemaVersion: "interview-question-generation-v1",
  provider: "deepseek",
  model: "deepseek-v4-flash",
  status: "queued" as const,
  attemptCount: 0,
  result: null,
  errorCode: null,
  errorMessage: null,
  requestId: null,
  updatedAt: "2026-08-21T12:00:00.000Z",
  createdAt: "2026-08-21T12:00:00.000Z",
};

function deps() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: userId }),
    getApplication: vi.fn().mockResolvedValue(application),
    getAIProcessingConsentAt: vi.fn().mockResolvedValue("2026-08-21T10:00:00.000Z"),
    listRequirements: vi.fn().mockResolvedValue(requirements),
    listCommonPrompts: vi.fn().mockResolvedValue(["Tell me about yourself"]),
    createOrGetRun: vi.fn().mockResolvedValue(run),
    providerConfig: { provider: "deepseek", model: "deepseek-v4-flash" },
    providerFactory: vi.fn().mockReturnValue({ generateInterviewQuestions: vi.fn() }),
    runGeneration: vi.fn().mockResolvedValue({ ...run, status: "succeeded" as const }),
    clock: vi.fn(() => new Date("2026-08-21T12:01:00.000Z")),
  };
}

function context(id = applicationId) {
  return { params: Promise.resolve({ id }) };
}

describe("interview question generation HTTP boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hashes stable generation inputs and excludes unrelated question-bank data", () => {
    const base = buildInterviewQuestionGenerationInputHash({
      jdText: application.jdText,
      requirements,
      commonPrompts: [" Tell me   about yourself? "],
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
    const reordered = buildInterviewQuestionGenerationInputHash({
      jdText: application.jdText,
      requirements: [...requirements].reverse(),
      commonPrompts: ["tell me about yourself"],
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(base).toBe(reordered);
  });

  it("rejects unauthenticated requests before application, consent, or run reads", async () => {
    const dependencies = deps();
    dependencies.getCurrentUser.mockResolvedValue(null);
    const post = createInterviewQuestionGenerationPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(401);
    expect(dependencies.getApplication).not.toHaveBeenCalled();
    expect(dependencies.createOrGetRun).not.toHaveBeenCalled();
  });

  it("checks ownership and consent before loading inputs or creating a run", async () => {
    const dependencies = deps();
    dependencies.getApplication.mockResolvedValue(null);
    const post = createInterviewQuestionGenerationPostHandler(dependencies);
    expect((await post(new Request("http://test"), context())).status).toBe(404);
    expect(dependencies.getAIProcessingConsentAt).not.toHaveBeenCalled();

    dependencies.getApplication.mockResolvedValue(application);
    dependencies.getAIProcessingConsentAt.mockResolvedValue(null);
    expect((await post(new Request("http://test"), context())).status).toBe(403);
    expect(dependencies.listRequirements).not.toHaveBeenCalled();
    expect(dependencies.createOrGetRun).not.toHaveBeenCalled();
  });

  it("reuses fresh running and succeeded runs without constructing a provider", async () => {
    const dependencies = deps();
    dependencies.createOrGetRun.mockResolvedValue({ ...run, status: "running" });
    const post = createInterviewQuestionGenerationPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ runId, reused: true });
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
    expect(dependencies.runGeneration).not.toHaveBeenCalled();
  });

  it("loads requirements and common prompts before creating a queued run", async () => {
    const dependencies = deps();
    const post = createInterviewQuestionGenerationPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(200);
    expect(dependencies.createOrGetRun).toHaveBeenCalledWith({
      applicationId,
      inputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      schemaVersion: "interview-question-generation-v1",
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
    expect(dependencies.runGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        run,
        application,
        requirements,
        commonPrompts: ["Tell me about yourself"],
        providerFactory: dependencies.providerFactory,
      }),
    );
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ runId, reused: false });
  });

  it("returns a stable error without exposing source text", async () => {
    const dependencies = deps();
    dependencies.runGeneration.mockRejectedValue(new Error(application.jdText));
    const post = createInterviewQuestionGenerationPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("interview-question-generation-request-failed");
    expect(body).not.toContain(application.jdText);
  });

  it("does not reuse a stale running run", async () => {
    const dependencies = deps();
    dependencies.createOrGetRun.mockResolvedValue({
      ...run,
      status: "running",
      updatedAt: "2026-08-21T11:57:00.000Z",
    });
    const post = createInterviewQuestionGenerationPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(200);
    expect(dependencies.runGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ providerFactory: dependencies.providerFactory }),
    );
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
  });

  it("keeps provider construction inside generation orchestration", async () => {
    const dependencies = deps();
    const post = createInterviewQuestionGenerationPostHandler(dependencies);

    await post(new Request("http://test"), context());

    const invocation = dependencies.runGeneration.mock.calls[0][0];
    expect(invocation.providerFactory).toBe(dependencies.providerFactory);
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
  });
});
