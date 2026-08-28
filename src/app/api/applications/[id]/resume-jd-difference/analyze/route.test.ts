// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resumeJDDifferenceOutputSchema,
  validateResumeJDDifferenceGraph,
} from "@/features/resume-jd-difference/schemas";

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  application: "11111111-1111-4111-8111-111111111111",
  asset: "22222222-2222-4222-8222-222222222222",
  run: "33333333-3333-4333-8333-333333333333",
};

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getApplication: vi.fn(),
  getAIProcessingConsentAt: vi.fn(),
  getOwnedAsset: vi.fn(),
  listConfirmedFacts: vi.fn(),
  createResumeJDDifferenceService: vi.fn(),
  serviceRun: vi.fn(),
  createDeepSeekAIProvider: vi.fn(),
  getServerEnv: vi.fn(),
  downloadSource: vi.fn(),
  extractResumeText: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/features/account/repository", () => ({
  getAIProcessingConsentAt: mocks.getAIProcessingConsentAt,
}));
vi.mock("@/features/applications/repository", () => ({
  applicationRepository: { get: mocks.getApplication },
}));
vi.mock("@/features/jd-analysis/repository", () => ({
  listConfirmedFactsForAnalysis: mocks.listConfirmedFacts,
}));
vi.mock("@/features/source-assets/repository", () => ({
  getOwnedAsset: mocks.getOwnedAsset,
}));
vi.mock("@/features/source-assets/storage", () => ({
  downloadSource: mocks.downloadSource,
}));
vi.mock("@/features/source-assets/parsers", () => ({
  extractResumeText: mocks.extractResumeText,
}));
vi.mock("@/features/extraction/deepseek-extractor", () => ({
  createDeepSeekAIProvider: mocks.createDeepSeekAIProvider,
}));
vi.mock("@/features/resume-jd-difference/repository", () => ({
  resumeJDDifferenceRepository: {
    createOrGet: vi.fn(),
    claim: vi.fn(),
    getOwned: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  },
}));
vi.mock("@/features/resume-jd-difference/service", () => ({
  createResumeJDDifferenceService: mocks.createResumeJDDifferenceService,
}));

function context() {
  return { params: Promise.resolve({ id: ids.application }) };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.getServerEnv.mockReturnValue({
    AI_TEXT_PROVIDER: "deepseek",
    AI_TEXT_MODEL: "deepseek-v4-flash",
    DEEPSEEK_API_KEY: "test-key",
    E2E_FAKE_EXTRACTOR: "1",
    AI_PRICE_SCHEDULE_JSON: undefined,
    RESUME_JD_DIFFERENCE_PROMPT_VARIANT: "p1",
  });
  mocks.getCurrentUser.mockResolvedValue({ id: ids.user });
  mocks.getApplication.mockResolvedValue({
    id: ids.application,
    userId: ids.user,
    jdText: "Collaborate with stakeholders to align reporting needs.",
    resumeSourceAssetId: ids.asset,
  });
  mocks.getAIProcessingConsentAt.mockResolvedValue("2026-08-28T10:00:00.000Z");
  mocks.getOwnedAsset.mockResolvedValue({
    id: ids.asset,
    userId: ids.user,
    originalName: "resume.pdf",
    contentType: "application/pdf",
    storagePath: "private/resume.pdf",
    sizeBytes: 100,
    sha256: "a".repeat(64),
    duplicateOfId: null,
    status: "ready",
    errorCode: null,
    createdAt: "2026-08-28T10:00:00.000Z",
  });
  mocks.listConfirmedFacts.mockResolvedValue([]);
  mocks.serviceRun.mockResolvedValue({
    run: {
      id: ids.run,
      status: "succeeded",
      errorCode: null,
    },
    reused: false,
  });
  mocks.createResumeJDDifferenceService.mockReturnValue({
    run: mocks.serviceRun,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resume JD difference route wiring", () => {
  it("exports a bounded Node route and composes the single service", async () => {
    const route = await import("./route");
    const response = await route.POST(
      new Request("http://test", {
        method: "POST",
        headers: { "x-resume-source-asset-id": ids.asset },
      }),
      context(),
    );

    expect(route.runtime).toBe("nodejs");
    expect(route.maxDuration).toBe(60);
    expect(response.status).toBe(200);
    expect(mocks.getApplication).toHaveBeenCalledWith(ids.user, ids.application);
    expect(mocks.getOwnedAsset).toHaveBeenCalledWith(ids.user, ids.asset);
    expect(mocks.listConfirmedFacts).toHaveBeenCalledWith(ids.user);
    expect(mocks.createResumeJDDifferenceService).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "fake",
        model: "fake-resume-jd-difference-v4",
        promptVariant: "p1",
        storage: { download: mocks.downloadSource },
        parser: mocks.extractResumeText,
        providerFactory: expect.any(Function),
        logger: {
          info: expect.any(Function),
          error: expect.any(Function),
        },
      }),
    );
    expect(mocks.serviceRun).toHaveBeenCalledTimes(1);
    expect(mocks.createDeepSeekAIProvider).not.toHaveBeenCalled();
  });

  it("provides one deterministic fake graph for both result pages", async () => {
    const route = await import("./route");
    await route.POST(
      new Request("http://test", {
        method: "POST",
        headers: { "x-resume-source-asset-id": ids.asset },
      }),
      context(),
    );
    const serviceDependencies =
      mocks.createResumeJDDifferenceService.mock.calls[0][0];
    const provider = serviceDependencies.providerFactory();
    const input = {
      jdText: "Collaborate with stakeholders to align reporting needs.",
      resumeText:
        "Worked with business teams and gathered reporting needs for weekly reports.",
      confirmedFacts: [],
    };

    const first = await provider.analyzeResumeJDDifference(input, {
      promptVariant: "p1",
    });
    const second = await provider.analyzeResumeJDDifference(input, {
      promptVariant: "p1",
    });
    expect(first).toEqual(second);
    const parsed = resumeJDDifferenceOutputSchema.parse(first.data);
    expect(validateResumeJDDifferenceGraph(parsed)).toEqual({ ok: true });
    expect(parsed.jobCore.concepts.length).toBeGreaterThan(0);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.matched.length).toBeGreaterThan(0);
    expect(parsed.directions.length).toBeGreaterThan(0);
  });

  it("suppresses the fake in production and constructs DeepSeek lazily", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.createDeepSeekAIProvider.mockReturnValue({
      analyzeResumeJDDifference: vi.fn(),
    });
    const route = await import("./route");
    await route.POST(
      new Request("http://test", {
        method: "POST",
        headers: { "x-resume-source-asset-id": ids.asset },
      }),
      context(),
    );

    expect(mocks.createDeepSeekAIProvider).not.toHaveBeenCalled();
    const serviceDependencies =
      mocks.createResumeJDDifferenceService.mock.calls[0][0];
    serviceDependencies.providerFactory();
    expect(mocks.createDeepSeekAIProvider).toHaveBeenCalledWith({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
    });
  });
});
