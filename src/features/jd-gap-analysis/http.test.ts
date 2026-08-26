// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  createJDGapAdvancePostHandler,
  type JDGapAdvanceResponse,
} from "./http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const structureRunId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const gapRunId = "44444444-4444-4444-8444-444444444444";
const requirementId = "55555555-5555-4555-8555-555555555555";
const criterionId = "66666666-6666-4666-8666-666666666666";
const factId = "77777777-7777-4777-8777-777777777777";
const timestamp = "2026-08-25T00:00:00.000Z";

const application = {
  id: applicationId,
  userId,
  jdText: "At least three years of advanced SQL experience is required.",
  resumeSourceAssetId: assetId,
};

const asset = {
  id: assetId,
  userId,
  originalName: "resume.pdf",
  contentType: "application/pdf",
  storagePath: `${userId}/${assetId}/resume.pdf`,
  sizeBytes: 100,
  sha256: "a".repeat(64),
  duplicateOfId: null,
  status: "ready" as const,
  errorCode: null,
  createdAt: timestamp,
};

const structureRun = {
  id: structureRunId,
  applicationId,
  userId,
  jdSha256: "b".repeat(64),
  inputHash: "c".repeat(64),
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

const succeededStructure = {
  ...structureRun,
  status: "succeeded" as const,
  attemptCount: 1,
  jdTranslationZh: "要求至少三年高级 SQL 经验。",
  result: {} as never,
  startedAt: timestamp,
  finishedAt: timestamp,
};

const requirement = {
  id: requirementId,
  runId: structureRunId,
  applicationId,
  userId,
  category: "hard_requirement" as const,
  requirementType: "required" as const,
  originalText: "At least three years of advanced SQL experience",
  translationZh: "至少三年高级 SQL 经验",
  sourceExcerpt: "At least three years of advanced SQL experience",
  allowsEquivalent: false,
  explicitGate: false,
  sortOrder: 0,
  createdAt: timestamp,
  criteria: [{
    id: criterionId,
    requirementId,
    runId: structureRunId,
    applicationId,
    userId,
    groupKey: "g1",
    groupRule: "all" as const,
    kind: "years_experience" as const,
    originalText: "At least three years",
    translationZh: "至少三年",
    constraint: { operator: "gte" as const, value: "3", unit: "years" },
    sortOrder: 0,
    createdAt: timestamp,
  }],
};

const gapRun = {
  id: gapRunId,
  applicationId,
  userId,
  structureRunId,
  sourceAssetId: assetId,
  sourceFilename: "resume.pdf",
  sourceSha256: "a".repeat(64),
  factFingerprint: "d".repeat(64),
  inputHash: "e".repeat(64),
  provider: "deepseek",
  model: "deepseek-chat",
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

const fact = {
  id: factId,
  factType: "work_experience" as const,
  title: "Data Analyst",
  organization: "Example",
  description: "Built SQL reports.",
  skills: ["SQL"],
  sourceExcerpt: "Built SQL reports",
};

function dependencies() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: userId }),
    getApplication: vi.fn().mockResolvedValue(application),
    getAIProcessingConsentAt: vi.fn().mockResolvedValue(timestamp),
    getOwnedAsset: vi.fn().mockResolvedValue(asset),
    listConfirmedFacts: vi.fn().mockResolvedValue([fact]),
    createOrGetStructureRun: vi.fn().mockResolvedValue(structureRun),
    listRequirements: vi.fn().mockResolvedValue([requirement]),
    createOrGetGapRun: vi.fn().mockResolvedValue(gapRun),
    providerConfig: {
      provider: "deepseek",
      model: "deepseek-chat",
      structurePromptVersion: "jd-structure-v3.1",
      comparisonPromptVersion: "jd-gap-p3-self-check-v1",
      comparisonPromptVariant: "p3" as const,
      policyVersion: "jd-gap-policy-v3.1",
    },
    runStructure: vi.fn().mockResolvedValue({
      run: succeededStructure,
      reused: false,
    }),
    runComparison: vi.fn().mockResolvedValue({
      run: { ...gapRun, status: "succeeded" as const, attemptCount: 1, result: {} as never },
      reused: false,
    }),
  };
}

function context(id = applicationId) {
  return { params: Promise.resolve({ id }) };
}

function request(init: RequestInit = {}) {
  return new Request("http://test", {
    method: "POST",
    ...init,
    headers: { "x-resume-source-asset-id": assetId, ...init.headers },
  });
}

async function json(response: Response) {
  return response.json() as Promise<JDGapAdvanceResponse | { error: string }>;
}

describe("JD gap advance POST handler", () => {
  it("guards authentication, UUID, application ownership, and consent in order", async () => {
    const fakes = dependencies();
    fakes.getCurrentUser.mockResolvedValueOnce(null);
    let response = await createJDGapAdvancePostHandler(fakes)(request(), context());
    expect(response.status).toBe(401);

    response = await createJDGapAdvancePostHandler(fakes)(request(), context("bad-id"));
    expect(response.status).toBe(404);

    fakes.getApplication.mockResolvedValueOnce(null);
    response = await createJDGapAdvancePostHandler(fakes)(request(), context());
    expect(response.status).toBe(404);

    fakes.getAIProcessingConsentAt.mockResolvedValueOnce(null);
    response = await createJDGapAdvancePostHandler(fakes)(request(), context());
    expect(response.status).toBe(403);
    expect(fakes.createOrGetStructureRun).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["invalid", "not-a-uuid"],
    ["stale", "88888888-8888-4888-8888-888888888888"],
  ] as const)("rejects a %s selected-resume header before analysis", async (_label, value) => {
    const fakes = dependencies();
    const response = await createJDGapAdvancePostHandler(fakes)(
      new Request("http://test", {
        method: "POST",
        headers: value ? { "x-resume-source-asset-id": value } : undefined,
      }),
      context(),
    );
    expect(response.status).toBe(409);
    await expect(json(response)).resolves.toEqual({ error: "resume-source-changed" });
    expect(fakes.getOwnedAsset).not.toHaveBeenCalled();
    expect(fakes.createOrGetStructureRun).not.toHaveBeenCalled();
  });

  it("requires a selected, owned, ready resume", async () => {
    const noSelection = dependencies();
    noSelection.getApplication.mockResolvedValueOnce({ ...application, resumeSourceAssetId: null });
    expect((await createJDGapAdvancePostHandler(noSelection)(request(), context())).status).toBe(409);

    const missingAsset = dependencies();
    missingAsset.getOwnedAsset.mockResolvedValueOnce(null);
    expect((await createJDGapAdvancePostHandler(missingAsset)(request(), context())).status).toBe(409);
    expect(missingAsset.createOrGetStructureRun).not.toHaveBeenCalled();
  });

  it("strictly validates OCR JSON and its one-megabyte byte limit", async () => {
    const fakes = dependencies();
    const handler = createJDGapAdvancePostHandler(fakes);
    const malformed = await handler(request({
      body: "{",
      headers: { "content-type": "application/json" },
    }), context());
    expect(malformed.status).toBe(400);

    const extra = await handler(request({
      body: JSON.stringify({ ocrText: "valid", extra: true }),
      headers: { "content-type": "application/json" },
    }), context());
    expect(extra.status).toBe(400);

    const oversized = await handler(request({
      body: JSON.stringify({ ocrText: "x".repeat(1_048_577) }),
      headers: { "content-type": "application/json" },
    }), context());
    expect(oversized.status).toBe(413);
    expect(fakes.createOrGetStructureRun).not.toHaveBeenCalled();
  });

  it("runs only fresh structure work and tells the client to advance", async () => {
    const fakes = dependencies();
    const response = await createJDGapAdvancePostHandler(fakes)(request(), context());
    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({
      status: "succeeded",
      phase: "structure",
      nextPhase: "comparison",
      structureRunId,
      gapRunId: null,
      reused: false,
      errorCode: null,
    });
    expect(fakes.runStructure).toHaveBeenCalledTimes(1);
    expect(fakes.createOrGetGapRun).not.toHaveBeenCalled();
    expect(fakes.runComparison).not.toHaveBeenCalled();
  });

  it("uses a cached structure to run comparison with OCR in one request", async () => {
    const fakes = dependencies();
    fakes.createOrGetStructureRun.mockResolvedValueOnce(succeededStructure);
    const ocrText = "Data analyst with three years of advanced SQL and reporting experience.";
    const response = await createJDGapAdvancePostHandler(fakes)(request({
      body: JSON.stringify({ ocrText }),
      headers: { "content-type": "application/json" },
    }), context());
    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      status: "succeeded",
      phase: "complete",
      nextPhase: null,
      structureRunId,
      gapRunId,
      reused: false,
    });
    expect(fakes.runStructure).not.toHaveBeenCalled();
    expect(fakes.runComparison).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      run: gapRun,
      structureRun: succeededStructure,
      asset,
      confirmedFacts: [fact],
      ocrText,
    }));
  });

  it("fingerprints every confirmed fact field into the comparison cache key", async () => {
    const baseline = dependencies();
    baseline.createOrGetStructureRun.mockResolvedValue(succeededStructure);
    await createJDGapAdvancePostHandler(baseline)(request(), context());
    const first = baseline.createOrGetGapRun.mock.calls[0][0];

    const changed = dependencies();
    changed.createOrGetStructureRun.mockResolvedValue(succeededStructure);
    changed.listConfirmedFacts.mockResolvedValue([{ ...fact, description: "Built advanced SQL models." }]);
    await createJDGapAdvancePostHandler(changed)(request(), context());
    const second = changed.createOrGetGapRun.mock.calls[0][0];
    expect(second.factFingerprint).not.toBe(first.factFingerprint);
    expect(second.inputHash).not.toBe(first.inputHash);
    expect(JSON.stringify(second)).not.toContain("Built advanced SQL models");
  });

  it("returns a cached complete run without invoking either stage", async () => {
    const fakes = dependencies();
    fakes.createOrGetStructureRun.mockResolvedValue(succeededStructure);
    fakes.createOrGetGapRun.mockResolvedValue({
      ...gapRun,
      status: "succeeded",
      attemptCount: 1,
      result: {} as never,
    });
    const response = await createJDGapAdvancePostHandler(fakes)(request(), context());
    await expect(json(response)).resolves.toMatchObject({
      status: "succeeded",
      phase: "complete",
      reused: true,
    });
    expect(fakes.runStructure).not.toHaveBeenCalled();
    expect(fakes.runComparison).not.toHaveBeenCalled();
  });
});
