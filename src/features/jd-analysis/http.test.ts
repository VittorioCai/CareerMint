// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applicationAnalysisSchemaVersion,
  createApplicationAnalysisPostHandler,
} from "./http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const application = {
  id: applicationId,
  userId,
  jdText:
    "Lead product discovery across international markets. Advanced SQL is required.",
};
const confirmedFacts = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    factType: "skill" as const,
    title: "SQL",
    organization: null,
    description: "Advanced SQL analysis",
    skills: ["SQL"],
    sourceExcerpt: null,
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
    createOrGetRun: vi.fn().mockResolvedValue(run),
    providerConfig: { provider: "deepseek", model: "deepseek-v4-flash" },
    providerFactory: vi.fn().mockReturnValue({
      analyzeJobDescription: vi.fn(),
    }),
    runAnalysis: vi.fn().mockResolvedValue({
      ...run,
      status: "succeeded" as const,
    }),
  };
}

function context(id = applicationId) {
  return { params: Promise.resolve({ id }) };
}

describe("application JD analysis POST handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the translated v2 schema in the cache identity", () => {
    expect(applicationAnalysisSchemaVersion).toBe("jd-analysis-v2");
  });

  it("rejects unauthenticated requests before reading application data", async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUser.mockResolvedValue(null);
    const post = createApplicationAnalysisPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(401);
    expect(dependencies.getApplication).not.toHaveBeenCalled();
  });

  it("returns the same not-found response for invalid and unowned application ids", async () => {
    const dependencies = createDependencies();
    const post = createApplicationAnalysisPostHandler(dependencies);

    expect(
      (await post(new Request("http://test"), context("invalid"))).status,
    ).toBe(404);
    dependencies.getApplication.mockResolvedValue(null);
    expect((await post(new Request("http://test"), context())).status).toBe(404);
  });

  it("requires existing AI data consent before creating a billable run", async () => {
    const dependencies = createDependencies();
    dependencies.getAIProcessingConsentAt.mockResolvedValue(null);
    const post = createApplicationAnalysisPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "ai-processing-consent-required",
    });
    expect(dependencies.createOrGetRun).not.toHaveBeenCalled();
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
  });

  it("reuses a succeeded run without creating a provider call", async () => {
    const dependencies = createDependencies();
    dependencies.createOrGetRun.mockResolvedValue({
      ...run,
      status: "succeeded",
    });
    const post = createApplicationAnalysisPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId,
      status: "succeeded",
      reused: true,
    });
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
    expect(dependencies.runAnalysis).not.toHaveBeenCalled();
  });

  it("hashes the JD plus confirmed facts and explicitly runs a new analysis", async () => {
    const dependencies = createDependencies();
    const post = createApplicationAnalysisPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(200);
    expect(dependencies.createOrGetRun).toHaveBeenCalledWith({
      applicationId,
      inputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
    expect(dependencies.providerFactory).toHaveBeenCalledOnce();
    expect(dependencies.runAnalysis).toHaveBeenCalledWith({
      userId,
      run,
      application,
      confirmedFacts,
      provider: dependencies.providerFactory.mock.results[0].value,
    });
    await expect(response.json()).resolves.toMatchObject({
      runId,
      status: "succeeded",
      reused: false,
    });
  });

  it("returns a stable error without exposing private JD content", async () => {
    const dependencies = createDependencies();
    dependencies.runAnalysis.mockRejectedValue(
      new Error(`storage failed: ${application.jdText}`),
    );
    const post = createApplicationAnalysisPostHandler(dependencies);

    const response = await post(new Request("http://test"), context());

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("jd-analysis-request-failed");
    expect(body).not.toContain(application.jdText);
  });
});
