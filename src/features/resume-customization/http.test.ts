// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createResumeGenerationPostHandler } from "./http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const application = {
  id: applicationId,
  userId,
  jdText: "Advanced SQL is required for funnel analysis.",
};
const confirmedFacts = [
  {
    id: "33333333-3333-4333-8333-333333333333",
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
    id: "44444444-4444-4444-8444-444444444444",
    category: "skill" as const,
    text: "Advanced SQL",
    priority: "core" as const,
  },
];
const run = {
  id: runId,
  applicationId,
  userId,
  inputHash: "a".repeat(64),
  provider: "deepseek",
  model: "deepseek-v4-flash",
  status: "queued" as const,
  attemptCount: 0,
  result: null,
  errorCode: null,
  createdAt: "2026-08-14T12:00:00.000Z",
};

function createDependencies() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: userId }),
    getApplication: vi.fn().mockResolvedValue(application),
    getAIProcessingConsentAt: vi
      .fn()
      .mockResolvedValue("2026-08-14T10:00:00.000Z"),
    listConfirmedFacts: vi.fn().mockResolvedValue(confirmedFacts),
    listRequirements: vi.fn().mockResolvedValue(requirements),
    createOrGetRun: vi.fn().mockResolvedValue(run),
    providerConfig: { provider: "deepseek", model: "deepseek-v4-flash" },
    providerFactory: vi.fn().mockReturnValue({
      generateResumeSuggestions: vi.fn(),
    }),
    runGeneration: vi.fn().mockResolvedValue({
      ...run,
      status: "succeeded" as const,
    }),
  };
}

function context(id = applicationId) {
  return { params: Promise.resolve({ id }) };
}

describe("application resume generation POST handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated and unowned application requests", async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUser.mockResolvedValue(null);
    const post = createResumeGenerationPostHandler(dependencies);
    expect((await post(new Request("http://test"), context())).status).toBe(401);
    expect(dependencies.getApplication).not.toHaveBeenCalled();

    dependencies.getCurrentUser.mockResolvedValue({ id: userId });
    dependencies.getApplication.mockResolvedValue(null);
    expect((await post(new Request("http://test"), context())).status).toBe(404);
  });

  it("requires consent, confirmed facts, and a completed JD analysis before billing", async () => {
    const dependencies = createDependencies();
    const post = createResumeGenerationPostHandler(dependencies);

    dependencies.getAIProcessingConsentAt.mockResolvedValue(null);
    expect((await post(new Request("http://test"), context())).status).toBe(403);
    dependencies.getAIProcessingConsentAt.mockResolvedValue(
      "2026-08-14T10:00:00.000Z",
    );
    dependencies.listConfirmedFacts.mockResolvedValue([]);
    const noFacts = await post(new Request("http://test"), context());
    expect(noFacts.status).toBe(409);
    await expect(noFacts.json()).resolves.toEqual({
      error: "confirmed-facts-required",
    });
    dependencies.listConfirmedFacts.mockResolvedValue(confirmedFacts);
    dependencies.listRequirements.mockResolvedValue([]);
    const noRequirements = await post(new Request("http://test"), context());
    expect(noRequirements.status).toBe(409);
    await expect(noRequirements.json()).resolves.toEqual({
      error: "jd-analysis-required",
    });
    expect(dependencies.createOrGetRun).not.toHaveBeenCalled();
  });

  it("reuses a succeeded run without creating a provider call", async () => {
    const dependencies = createDependencies();
    dependencies.createOrGetRun.mockResolvedValue({
      ...run,
      status: "succeeded",
    });
    const post = createResumeGenerationPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId,
      status: "succeeded",
      reused: true,
    });
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
    expect(dependencies.runGeneration).not.toHaveBeenCalled();
  });

  it("hashes current application inputs and explicitly runs a new generation", async () => {
    const dependencies = createDependencies();
    const post = createResumeGenerationPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(200);
    expect(dependencies.createOrGetRun).toHaveBeenCalledWith({
      applicationId,
      inputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
    expect(dependencies.runGeneration).toHaveBeenCalledWith({
      userId,
      run,
      application,
      confirmedFacts,
      requirements,
      provider: dependencies.providerFactory.mock.results[0].value,
    });
    await expect(response.json()).resolves.toMatchObject({
      runId,
      status: "succeeded",
      reused: false,
    });
  });

  it("returns a stable error without exposing private source content", async () => {
    const dependencies = createDependencies();
    dependencies.runGeneration.mockRejectedValue(
      new Error(`storage failed: ${application.jdText}`),
    );
    const post = createResumeGenerationPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("resume-generation-request-failed");
    expect(body).not.toContain(application.jdText);
  });
});
