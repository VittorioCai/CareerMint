// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  application: "11111111-1111-4111-8111-111111111111",
  analysis: "22222222-2222-4222-8222-222222222222",
  asset: "33333333-3333-4333-8333-333333333333",
  run: "44444444-4444-4444-8444-444444444444",
};

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getAIProcessingConsentAt: vi.fn(),
  getApplication: vi.fn(),
  getLatestSucceededAnalysis: vi.fn(),
  listRequirements: vi.fn(),
  getOwnedAsset: vi.fn(),
  createOrGet: vi.fn(),
  createResumeGapService: vi.fn(),
  serviceRun: vi.fn(),
  createDeepSeekAIProvider: vi.fn(),
  getServerEnv: vi.fn(),
  downloadSource: vi.fn(),
  extractResumeText: vi.fn(),
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
  jdAnalysisRepository: {
    getLatestSucceeded: mocks.getLatestSucceededAnalysis,
    listRequirements: mocks.listRequirements,
  },
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
vi.mock("@/features/resume-gaps/repository", () => ({
  resumeGapRepository: {
    createOrGet: mocks.createOrGet,
    claim: vi.fn(),
    getOwned: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  },
}));
vi.mock("@/features/resume-gaps/service", () => ({
  createResumeGapService: mocks.createResumeGapService,
}));

const queuedRun = {
  id: ids.run,
  applicationId: ids.application,
  userId: ids.user,
  analysisRunId: ids.analysis,
  sourceAssetId: ids.asset,
  sourceFilename: "resume.pdf",
  sourceSha256: "a".repeat(64),
  inputHash: "b".repeat(64),
  provider: "fake",
  model: "fake-resume-gap-v1",
  status: "queued" as const,
  attemptCount: 0,
  result: null,
  errorCode: null,
  errorMessage: null,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  startedAt: null,
  finishedAt: null,
};

const requirements = [
  {
    id: "55555555-5555-4555-8555-555555555555",
    analysisRunId: ids.analysis,
    applicationId: ids.application,
    category: "skill" as const,
    text: "Advanced SQL",
    priority: "core" as const,
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    analysisRunId: ids.analysis,
    applicationId: ids.application,
    category: "responsibility" as const,
    text: "funnel analysis",
    priority: "supporting" as const,
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    analysisRunId: ids.analysis,
    applicationId: ids.application,
    category: "skill" as const,
    text: "Kubernetes",
    priority: "supporting" as const,
  },
];

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
  });
  mocks.getCurrentUser.mockResolvedValue({ id: ids.user });
  mocks.getAIProcessingConsentAt.mockResolvedValue("2026-08-24T00:00:00.000Z");
  mocks.getApplication.mockResolvedValue({
    id: ids.application,
    userId: ids.user,
    resumeSourceAssetId: ids.asset,
  });
  mocks.getLatestSucceededAnalysis.mockResolvedValue({
    id: ids.analysis,
    applicationId: ids.application,
    userId: ids.user,
    status: "succeeded",
  });
  mocks.listRequirements.mockResolvedValue(requirements);
  mocks.getOwnedAsset.mockResolvedValue({
    id: ids.asset,
    userId: ids.user,
    originalName: "resume.pdf",
    contentType: "application/pdf",
    storagePath: "private/resume.pdf",
    sha256: "a".repeat(64),
  });
  mocks.createOrGet.mockResolvedValue(queuedRun);
  mocks.serviceRun.mockResolvedValue({
    run: { ...queuedRun, status: "succeeded" },
    reused: false,
  });
  mocks.createResumeGapService.mockReturnValue({ run: mocks.serviceRun });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("resume gap analysis route wiring", () => {
  it("exports the Node runtime and a bounded route duration", async () => {
    const route = await import("./route");
    expect(route.runtime).toBe("nodejs");
    expect(route.maxDuration).toBe(60);
  });

  it("composes owner, consent, JD, asset, parser, storage, repository, pricing, and service dependencies", async () => {
    const route = await import("./route");
    const response = await route.POST(
      new Request("http://test", { method: "POST", headers: { "x-resume-source-asset-id": ids.asset } }),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId: ids.run,
      status: "succeeded",
      reused: false,
      errorCode: null,
    });
    expect(mocks.getCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.getAIProcessingConsentAt).toHaveBeenCalledWith(ids.user);
    expect(mocks.getApplication).toHaveBeenCalledWith(ids.user, ids.application);
    expect(mocks.getLatestSucceededAnalysis).toHaveBeenCalledWith(ids.user, ids.application);
    expect(mocks.listRequirements).toHaveBeenCalledWith(ids.user, ids.application, ids.analysis);
    expect(mocks.getOwnedAsset).toHaveBeenCalledWith(ids.user, ids.asset);
    expect(mocks.createOrGet).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: ids.application,
        analysisRunId: ids.analysis,
        sourceAssetId: ids.asset,
        provider: "fake",
        model: "fake-resume-gap-v1",
      }),
    );
    expect(mocks.createResumeGapService).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: { download: mocks.downloadSource },
        parser: mocks.extractResumeText,
        priceSchedule: undefined,
        providerFactory: expect.any(Function),
      }),
    );
    expect(mocks.createDeepSeekAIProvider).not.toHaveBeenCalled();
  });

  it("provides a deterministic, grounded fake with one covered, one partial, and remaining missing", async () => {
    const route = await import("./route");
    await route.POST(new Request("http://test", { method: "POST", headers: { "x-resume-source-asset-id": ids.asset } }), context());
    const serviceDependencies = mocks.createResumeGapService.mock.calls[0][0];
    const provider = serviceDependencies.providerFactory();
    const resumeText =
      "Product Analyst. Advanced SQL for reporting. Experienced in funnel analysis and experimentation.";
    const first = await provider.analyzeResumeGaps({ resumeText, requirements });
    const second = await provider.analyzeResumeGaps({ resumeText, requirements });

    expect(first).toEqual(second);
    expect(first.data.items.map((item: { resumeCoverage: string }) => item.resumeCoverage)).toEqual([
      "covered",
      "partial",
      "missing",
    ]);
    expect(first.data.items[0].resumeExcerpt).toBe("Advanced SQL");
    expect(first.data.items[1].resumeExcerpt).toBe("funnel analysis");
    expect(first.data.items[2].resumeExcerpt).toBeNull();
    expect(Object.keys(first.data.items[0])).toEqual([
      "requirementId",
      "resumeCoverage",
      "resumeExcerpt",
    ]);
  });

  it("suppresses the fake in production and keeps DeepSeek construction lazy", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.getServerEnv.mockReturnValue({
      AI_TEXT_PROVIDER: "deepseek",
      AI_TEXT_MODEL: "deepseek-v4-flash",
      DEEPSEEK_API_KEY: "test-key",
      E2E_FAKE_EXTRACTOR: "1",
      AI_PRICE_SCHEDULE_JSON: undefined,
    });
    const route = await import("./route");
    await route.POST(new Request("http://test", { method: "POST", headers: { "x-resume-source-asset-id": ids.asset } }), context());
    const serviceDependencies = mocks.createResumeGapService.mock.calls[0][0];
    expect(mocks.createDeepSeekAIProvider).not.toHaveBeenCalled();
    serviceDependencies.providerFactory();
    expect(mocks.createDeepSeekAIProvider).toHaveBeenCalledWith({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
    });
  });

  it("logs invalid price configuration with a fixed metadata-only warning", async () => {
    mocks.getServerEnv.mockReturnValue({
      AI_TEXT_PROVIDER: "deepseek",
      AI_TEXT_MODEL: "deepseek-v4-flash",
      DEEPSEEK_API_KEY: "test-key",
      E2E_FAKE_EXTRACTOR: "1",
      AI_PRICE_SCHEDULE_JSON: JSON.stringify({ secret: "resume text" }),
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const route = await import("./route");
    await route.POST(new Request("http://test", { method: "POST", headers: { "x-resume-source-asset-id": ids.asset } }), context());
    expect(warning).toHaveBeenCalledWith("ai-price-config-unavailable");
    expect(warning.mock.calls.flat().join(" ")).not.toContain("resume text");
    warning.mockRestore();
  });

  it("passes a valid effective matching price schedule and a clock at the same instant", async () => {
    const fixedNow = new Date("2026-08-24T12:34:56.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    const schedule = {
      version: "deepseek-v4-2026-08",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      currency: "USD" as const,
      observedAt: "2026-08-01T00:00:00.000Z",
      sourceUrl: "https://example.com/prices",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: null,
      defaultRates: {
        inputCacheHitPerMillion: 1,
        inputCacheMissPerMillion: 2,
        outputPerMillion: 3,
      },
      peak: null,
    };
    mocks.getServerEnv.mockReturnValue({
      AI_TEXT_PROVIDER: "deepseek",
      AI_TEXT_MODEL: "deepseek-v4-flash",
      DEEPSEEK_API_KEY: "test-key",
      E2E_FAKE_EXTRACTOR: "0",
      AI_PRICE_SCHEDULE_JSON: JSON.stringify(schedule),
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const route = await import("./route");
    await route.POST(new Request("http://test", { method: "POST", headers: { "x-resume-source-asset-id": ids.asset } }), context());

    const serviceDependencies = mocks.createResumeGapService.mock.calls[0][0];
    expect(serviceDependencies.priceSchedule).toEqual(schedule);
    expect(serviceDependencies.clock()).toEqual(fixedNow);
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it("does not need an API key for early guards or cached/fresh-running reuse", async () => {
    mocks.getServerEnv.mockReturnValue({
      AI_TEXT_PROVIDER: "deepseek",
      AI_TEXT_MODEL: "deepseek-v4-flash",
      E2E_FAKE_EXTRACTOR: "0",
      AI_PRICE_SCHEDULE_JSON: undefined,
    });
    mocks.getCurrentUser.mockResolvedValue(null);
    const earlyRoute = await import("./route");
    expect(
      (await earlyRoute.POST(new Request("http://test", { method: "POST", headers: { "x-resume-source-asset-id": ids.asset } }), context())).status,
    ).toBe(401);
    expect(mocks.createDeepSeekAIProvider).not.toHaveBeenCalled();

    vi.resetModules();
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({
      AI_TEXT_PROVIDER: "deepseek",
      AI_TEXT_MODEL: "deepseek-v4-flash",
      E2E_FAKE_EXTRACTOR: "0",
      AI_PRICE_SCHEDULE_JSON: undefined,
    });
    mocks.getCurrentUser.mockResolvedValue({ id: ids.user });
    mocks.getAIProcessingConsentAt.mockResolvedValue("2026-08-24T00:00:00.000Z");
    mocks.getApplication.mockResolvedValue({
      id: ids.application,
      userId: ids.user,
      resumeSourceAssetId: ids.asset,
    });
    mocks.getLatestSucceededAnalysis.mockResolvedValue({
      id: ids.analysis,
      applicationId: ids.application,
      userId: ids.user,
      status: "succeeded",
    });
    mocks.listRequirements.mockResolvedValue(requirements);
    mocks.getOwnedAsset.mockResolvedValue({
      id: ids.asset,
      userId: ids.user,
      originalName: "resume.pdf",
      contentType: "application/pdf",
      storagePath: "private/resume.pdf",
      sha256: "a".repeat(64),
    });
    mocks.createOrGet.mockResolvedValue({ ...queuedRun, status: "succeeded" });
    const cachedRoute = await import("./route");
    expect(
      (await cachedRoute.POST(new Request("http://test", { method: "POST", headers: { "x-resume-source-asset-id": ids.asset } }), context())).status,
    ).toBe(200);
    expect(mocks.createDeepSeekAIProvider).not.toHaveBeenCalled();

    mocks.createOrGet.mockResolvedValue({ ...queuedRun, status: "running" });
    mocks.serviceRun.mockResolvedValue({
      run: { ...queuedRun, status: "running" },
      reused: true,
    });
    mocks.createResumeGapService.mockReturnValue({ run: mocks.serviceRun });
    expect(
      (await cachedRoute.POST(new Request("http://test", { method: "POST", headers: { "x-resume-source-asset-id": ids.asset } }), context())).status,
    ).toBe(200);
    expect(mocks.createDeepSeekAIProvider).not.toHaveBeenCalled();
  });
});
