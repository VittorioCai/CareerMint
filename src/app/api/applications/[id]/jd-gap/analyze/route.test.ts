// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  application: "11111111-1111-4111-8111-111111111111",
  structure: "22222222-2222-4222-8222-222222222222",
  asset: "33333333-3333-4333-8333-333333333333",
  gap: "44444444-4444-4444-8444-444444444444",
  requirement: "55555555-5555-4555-8555-555555555555",
  criterion: "66666666-6666-4666-8666-666666666666",
};

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getAIProcessingConsentAt: vi.fn(),
  getApplication: vi.fn(),
  getOwnedAsset: vi.fn(),
  listConfirmedFacts: vi.fn(),
  structureCreateOrGet: vi.fn(),
  listRequirements: vi.fn(),
  gapCreateOrGet: vi.fn(),
  createJDStructureService: vi.fn(),
  structureServiceRun: vi.fn(),
  createJDGapComparisonService: vi.fn(),
  comparisonServiceRun: vi.fn(),
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
vi.mock("@/features/source-assets/repository", () => ({
  getOwnedAsset: mocks.getOwnedAsset,
}));
vi.mock("@/features/source-assets/storage", () => ({
  downloadSource: mocks.downloadSource,
}));
vi.mock("@/features/source-assets/parsers", () => ({
  extractResumeText: mocks.extractResumeText,
}));
vi.mock("@/features/jd-analysis/repository", () => ({
  listConfirmedFactsForAnalysis: mocks.listConfirmedFacts,
}));
vi.mock("@/features/jd-gap-analysis/structure-repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/jd-gap-analysis/structure-repository")>();
  return {
    ...original,
    jdStructureRepository: {
      createOrGet: mocks.structureCreateOrGet,
      listRequirementsWithCriteria: mocks.listRequirements,
      claim: vi.fn(),
      getOwned: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    },
  };
});
vi.mock("@/features/jd-gap-analysis/gap-repository", () => ({
  jdGapV3Repository: {
    createOrGet: mocks.gapCreateOrGet,
    claim: vi.fn(),
    getOwned: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  },
}));
vi.mock("@/features/jd-gap-analysis/structure-service", () => ({
  createJDStructureService: mocks.createJDStructureService,
}));
vi.mock("@/features/jd-gap-analysis/comparison-service", () => ({
  createJDGapComparisonService: mocks.createJDGapComparisonService,
}));
vi.mock("@/features/extraction/deepseek-extractor", () => ({
  createDeepSeekAIProvider: mocks.createDeepSeekAIProvider,
}));

const timestamp = "2026-08-25T00:00:00.000Z";
const queuedStructure = {
  id: ids.structure,
  applicationId: ids.application,
  userId: ids.user,
  jdSha256: "a".repeat(64),
  inputHash: "b".repeat(64),
  provider: "fake",
  model: "fake-jd-gap-v3",
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

const succeededStructure = {
  ...queuedStructure,
  status: "succeeded" as const,
  attemptCount: 1,
  jdTranslationZh: "要求高级 SQL。",
  result: {} as never,
  startedAt: timestamp,
  finishedAt: timestamp,
};

const queuedGap = {
  id: ids.gap,
  applicationId: ids.application,
  userId: ids.user,
  structureRunId: ids.structure,
  sourceAssetId: ids.asset,
  sourceFilename: "resume.pdf",
  sourceSha256: "c".repeat(64),
  factFingerprint: "d".repeat(64),
  inputHash: "e".repeat(64),
  provider: "fake",
  model: "fake-jd-gap-v3",
  schemaVersion: "resume-gap-v3",
  promptVersion: "jd-gap-p3-self-check-v1",
  policyVersion: "jd-gap-policy-v3.1",
  status: "queued" as const,
  attemptCount: 0,
  result: null,
  errorCode: null,
  errorMessage: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  startedAt: null,
  finishedAt: null,
};

const requirement = {
  id: ids.requirement,
  runId: ids.structure,
  applicationId: ids.application,
  userId: ids.user,
  category: "skill" as const,
  requirementType: "required" as const,
  originalText: "Advanced SQL",
  translationZh: "高级 SQL",
  sourceExcerpt: "Advanced SQL experience is required.",
  allowsEquivalent: false,
  explicitGate: false,
  sortOrder: 0,
  createdAt: timestamp,
  criteria: [{
    id: ids.criterion,
    requirementId: ids.requirement,
    runId: ids.structure,
    applicationId: ids.application,
    userId: ids.user,
    groupKey: "g1",
    groupRule: "all" as const,
    kind: "tool" as const,
    originalText: "Advanced SQL",
    translationZh: "高级 SQL",
    constraint: { operator: "exact" as const, value: "SQL", unit: null },
    sortOrder: 0,
    createdAt: timestamp,
  }],
};

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
    JD_GAP_MATCH_PROMPT_VARIANT: "p3",
    E2E_FAKE_EXTRACTOR: "1",
    AI_PRICE_SCHEDULE_JSON: undefined,
  });
  mocks.getCurrentUser.mockResolvedValue({ id: ids.user });
  mocks.getAIProcessingConsentAt.mockResolvedValue(timestamp);
  mocks.getApplication.mockResolvedValue({
    id: ids.application,
    userId: ids.user,
    jdText: "Advanced SQL experience is required.",
    resumeSourceAssetId: ids.asset,
  });
  mocks.getOwnedAsset.mockResolvedValue({
    id: ids.asset,
    userId: ids.user,
    originalName: "resume.pdf",
    contentType: "application/pdf",
    storagePath: "private/resume.pdf",
    sizeBytes: 100,
    sha256: "c".repeat(64),
    duplicateOfId: null,
    status: "ready",
    errorCode: null,
    createdAt: timestamp,
  });
  mocks.listConfirmedFacts.mockResolvedValue([]);
  mocks.structureCreateOrGet.mockResolvedValue(queuedStructure);
  mocks.listRequirements.mockResolvedValue([requirement]);
  mocks.gapCreateOrGet.mockResolvedValue(queuedGap);
  mocks.structureServiceRun.mockResolvedValue({ run: succeededStructure, reused: false });
  mocks.comparisonServiceRun.mockResolvedValue({
    run: { ...queuedGap, status: "succeeded", attemptCount: 1, result: {} },
    reused: false,
  });
  mocks.createJDStructureService.mockReturnValue({ run: mocks.structureServiceRun });
  mocks.createJDGapComparisonService.mockReturnValue({ run: mocks.comparisonServiceRun });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("JD gap v3 route wiring", () => {
  it("exports Node runtime and a bounded duration", async () => {
    const route = await import("./route");
    expect(route.runtime).toBe("nodejs");
    expect(route.maxDuration).toBe(60);
  });

  it("wires the structure stage without constructing DeepSeek early", async () => {
    const route = await import("./route");
    const response = await route.POST(
      new Request("http://test", {
        method: "POST",
        headers: { "x-resume-source-asset-id": ids.asset },
      }),
      context(),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      phase: "structure",
      nextPhase: "comparison",
      structureRunId: ids.structure,
    });
    expect(mocks.getApplication).toHaveBeenCalledWith(ids.user, ids.application);
    expect(mocks.structureCreateOrGet).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: ids.application,
      provider: "fake",
      model: "fake-jd-gap-v3",
      schemaVersion: "jd-analysis-v3",
      promptVersion: "jd-structure-v3.1",
    }));
    expect(mocks.createJDStructureService).toHaveBeenCalledWith(expect.objectContaining({
      runs: expect.any(Object),
      providerFactory: expect.any(Function),
    }));
    expect(mocks.createDeepSeekAIProvider).not.toHaveBeenCalled();
  });

  it("wires cached structure into the comparison service with storage/parser", async () => {
    mocks.structureCreateOrGet.mockResolvedValue(succeededStructure);
    const route = await import("./route");
    const response = await route.POST(
      new Request("http://test", {
        method: "POST",
        headers: { "x-resume-source-asset-id": ids.asset },
      }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(mocks.listRequirements).toHaveBeenCalledWith(ids.user, ids.structure);
    expect(mocks.gapCreateOrGet).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: ids.application,
      structureRunId: ids.structure,
      sourceAssetId: ids.asset,
      schemaVersion: "resume-gap-v3",
      promptVersion: "jd-gap-p3-self-check-v1",
      policyVersion: "jd-gap-policy-v3.1",
    }));
    expect(mocks.createJDGapComparisonService).toHaveBeenCalledWith(expect.objectContaining({
      storage: { download: mocks.downloadSource },
      parser: mocks.extractResumeText,
      promptVariant: "p3",
      providerFactory: expect.any(Function),
    }));
  });

  it("provides a deterministic fake that structures and compares only supplied text", async () => {
    const route = await import("./route");
    await route.POST(
      new Request("http://test", {
        method: "POST",
        headers: { "x-resume-source-asset-id": ids.asset },
      }),
      context(),
    );
    const provider = mocks.createJDStructureService.mock.calls[0][0].providerFactory();
    const structured = await provider.structureJobDescription({
      jdText: "Advanced SQL experience is required.",
    });
    expect(structured.data.requirements[0].sourceExcerpt).toBe(
      "Advanced SQL experience is required.",
    );
    const compared = await provider.compareJDGapCriteria({
      resumeText: "Data analyst with Advanced SQL experience and reporting skills.",
      requirements: [{
        id: requirement.id,
        category: requirement.category,
        requirementType: requirement.requirementType,
        originalText: requirement.originalText,
        translationZh: requirement.translationZh,
        sourceExcerpt: requirement.sourceExcerpt,
        allowsEquivalent: requirement.allowsEquivalent,
        explicitGate: requirement.explicitGate,
        sortOrder: requirement.sortOrder,
        criteria: requirement.criteria.map((criterion) => ({
          id: criterion.id,
          groupKey: criterion.groupKey,
          groupRule: criterion.groupRule,
          kind: criterion.kind,
          originalText: criterion.originalText,
          translationZh: criterion.translationZh,
          constraint: criterion.constraint,
          sortOrder: criterion.sortOrder,
        })),
      }],
      confirmedFacts: [],
    }, { promptVariant: "p3" });
    expect(compared.data.assessments[0].resumeExcerpt).toBe("Advanced SQL");
    expect(JSON.stringify(compared.data)).not.toContain("invented");
  });

  it("suppresses the fake in production and constructs DeepSeek lazily", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const route = await import("./route");
    await route.POST(
      new Request("http://test", {
        method: "POST",
        headers: { "x-resume-source-asset-id": ids.asset },
      }),
      context(),
    );
    const providerFactory = mocks.createJDStructureService.mock.calls[0][0].providerFactory;
    expect(mocks.createDeepSeekAIProvider).not.toHaveBeenCalled();
    providerFactory();
    expect(mocks.createDeepSeekAIProvider).toHaveBeenCalledWith({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
    });
  });
});
