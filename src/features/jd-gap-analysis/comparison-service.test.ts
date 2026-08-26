// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SourceAsset } from "@/features/source-assets/repository";

import { createJDGapComparisonService } from "./comparison-service";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const structureRunId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const requirementId = "55555555-5555-4555-8555-555555555555";
const criterionId = "66666666-6666-4666-8666-666666666666";
const factId = "77777777-7777-4777-8777-777777777777";
const timestamp = "2026-08-25T00:00:00.000Z";
const resumeText = "Data Analyst with 2 years SQL experience building reliable reports for business teams.";

const asset: SourceAsset = {
  id: assetId,
  userId,
  originalName: "resume.pdf",
  contentType: "application/pdf",
  storagePath: `${userId}/${assetId}/resume.pdf`,
  sizeBytes: 100,
  sha256: "a".repeat(64),
  duplicateOfId: null,
  status: "ready",
  errorCode: null,
  createdAt: timestamp,
};

const structureRun = {
  id: structureRunId,
  applicationId,
  userId,
  jdSha256: "d".repeat(64),
  inputHash: "e".repeat(64),
  provider: "deepseek",
  model: "deepseek-chat",
  schemaVersion: "jd-analysis-v3",
  promptVersion: "jd-structure-v3.1",
  status: "succeeded" as const,
  attemptCount: 1,
  jdTranslationZh: "要求至少三年 SQL 经验。",
  result: null as never,
  errorCode: null,
  errorMessage: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  startedAt: timestamp,
  finishedAt: timestamp,
};

const run = {
  id: runId,
  applicationId,
  userId,
  structureRunId,
  sourceAssetId: assetId,
  sourceFilename: asset.originalName,
  sourceSha256: asset.sha256,
  factFingerprint: "b".repeat(64),
  inputHash: "c".repeat(64),
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

const requirements = [{
  id: requirementId,
  category: "hard_requirement" as const,
  requirementType: "required" as const,
  originalText: "At least 3 years of SQL experience",
  translationZh: "至少三年 SQL 经验",
  sourceExcerpt: "At least 3 years of SQL experience",
  allowsEquivalent: false,
  explicitGate: false,
  sortOrder: 0,
  criteria: [{
    id: criterionId,
    groupKey: "g1",
    groupRule: "all" as const,
    kind: "years_experience" as const,
    originalText: "At least 3 years",
    translationZh: "至少三年",
    constraint: { operator: "gte" as const, value: "3", unit: "years" },
    sortOrder: 0,
  }],
}];

const facts = [{
  id: factId,
  factType: "work_experience" as const,
  title: "Data Analyst",
  organization: "Example",
  description: "Built SQL reports.",
  skills: ["SQL"],
  sourceExcerpt: "Built SQL reports",
}];

function succeeded(overrides: Record<string, unknown> = {}) {
  return {
    ...run,
    status: "succeeded" as const,
    attemptCount: 1,
    result: {
      requirementCount: 1,
      criterionCount: 1,
      completeCount: 0,
      partialCount: 1,
      noneCount: 0,
      needsConfirmationCount: 0,
      ai: {
        provider: "deepseek",
        model: "deepseek-chat",
        requestId: null,
        usage: { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3 },
        priceScheduleVersion: null,
      },
      estimatedCost: null,
    },
    startedAt: timestamp,
    finishedAt: timestamp,
    ...overrides,
  };
}

function dependencies() {
  const claimed = { ...run, status: "running" as const, attemptCount: 1, startedAt: timestamp };
  const provider = {
    compareJDGapCriteria: vi.fn().mockResolvedValue({
      data: { assessments: [{
        criterionId,
        resumeEvidenceStatus: "direct",
        resumeExcerpt: "2 years SQL experience",
        profileFactIds: [factId],
        gapType: "none",
        reasonZh: "简历显示两年经验。",
        userQuestionZh: null,
      }] },
      provider: "deepseek",
      model: "deepseek-chat",
      requestId: "req-2",
      usage: { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3 },
    }),
  };
  return {
    runs: {
      claim: vi.fn().mockResolvedValue(true),
      getOwned: vi.fn().mockResolvedValue(claimed),
      complete: vi.fn().mockResolvedValue(succeeded()),
      fail: vi.fn().mockImplementation(async (input: { errorCode: string; errorMessage: string }) => ({
        ...claimed,
        status: "failed" as const,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        finishedAt: timestamp,
      })),
    },
    storage: { download: vi.fn().mockResolvedValue(new Blob(["resume bytes"])) },
    parser: vi.fn().mockResolvedValue(resumeText),
    provider,
    providerFactory: vi.fn().mockReturnValue(provider),
    priceSchedule: undefined as import("@/features/ai/pricing").AIPriceSchedule | undefined,
    clock: () => new Date(timestamp),
    promptVariant: "p3" as const,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    run,
    structureRun,
    asset,
    requirements,
    confirmedFacts: facts,
    ...overrides,
  };
}

describe("JD gap comparison service", () => {
  it.each([
    ["run owner", { run: { ...run, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }],
    ["structure owner", { structureRun: { ...structureRun, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }],
    ["asset owner", { asset: { ...asset, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }],
    ["asset hash", { asset: { ...asset, sha256: "f".repeat(64) } }],
  ] as const)("rejects wrong %s before claim, download, or provider", async (_label, change) => {
    const fakes = dependencies();
    await expect(createJDGapComparisonService(fakes).run(input(change))).rejects.toThrow(
      "application-or-resume-not-found",
    );
    expect(fakes.runs.claim).not.toHaveBeenCalled();
    expect(fakes.storage.download).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
  });

  it("reuses a succeeded result without parsing or provider construction", async () => {
    const fakes = dependencies();
    const result = await createJDGapComparisonService(fakes).run(input({ run: succeeded() }));
    expect(result).toMatchObject({ reused: true, run: { status: "succeeded" } });
    expect(fakes.runs.claim).not.toHaveBeenCalled();
    expect(fakes.storage.download).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
  });

  it("uses browser OCR without download and passes confirmed facts separately", async () => {
    const fakes = dependencies();
    await createJDGapComparisonService(fakes).run(input({ ocrText: resumeText }));
    expect(fakes.storage.download).not.toHaveBeenCalled();
    expect(fakes.parser).not.toHaveBeenCalled();
    expect(fakes.provider.compareJDGapCriteria).toHaveBeenCalledWith(
      { resumeText, requirements, confirmedFacts: facts },
      { promptVariant: "p3" },
    );
    expect(fakes.providerFactory).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["PDF", "application/pdf"],
    ["DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ] as const)("downloads and parses the selected %s asset", async (_label, contentType) => {
    const fakes = dependencies();
    const selected = { ...asset, contentType };
    await createJDGapComparisonService(fakes).run(input({ asset: selected }));
    expect(fakes.storage.download).toHaveBeenCalledWith(asset.storagePath);
    expect(fakes.parser).toHaveBeenCalledWith(Buffer.from("resume bytes"), contentType);
  });

  it("applies deterministic threshold policy and persists exact aggregated output", async () => {
    const fakes = dependencies();
    await createJDGapComparisonService(fakes).run(input({ ocrText: resumeText }));
    expect(fakes.runs.complete).toHaveBeenCalledWith(expect.objectContaining({
      expectedAttemptCount: 1,
      requirementResults: [{
        requirementId,
        coverageStatus: "partial",
        impactLevel: "important",
        coveredCriterionCount: 0,
        missingCriterionCount: 1,
        sourceOrder: 0,
      }],
      assessments: [expect.objectContaining({
        criterionId,
        requirementId,
        resumeEvidenceStatus: "partial_direct",
        gapType: "too_vague",
        profileFactIds: [factId],
      })],
    }));
  });

  it("deduplicates with a fenced claim and never constructs a provider for another attempt", async () => {
    const fakes = dependencies();
    fakes.runs.claim.mockResolvedValueOnce(false);
    fakes.runs.getOwned.mockResolvedValueOnce({ ...run, status: "running", attemptCount: 1 });
    const result = await createJDGapComparisonService(fakes).run(input());
    expect(result.reused).toBe(true);
    expect(fakes.providerFactory).not.toHaveBeenCalled();

    const interleaved = dependencies();
    interleaved.runs.getOwned.mockResolvedValueOnce({ ...run, status: "running", attemptCount: 2 });
    const second = await createJDGapComparisonService(interleaved).run(input());
    expect(second.reused).toBe(true);
    expect(interleaved.providerFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["short OCR", { ocrText: "too short" }, "resume-text-too-short"],
    ["long OCR", { ocrText: "x".repeat(100_001) }, "resume-text-too-long"],
  ] as const)("maps %s safely before provider construction", async (_label, change, code) => {
    const fakes = dependencies();
    const result = await createJDGapComparisonService(fakes).run(input(change));
    expect(result.run.errorCode).toBe(code);
    expect(fakes.providerFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["download", { download: new Error("private storage detail") }, "source-download-failed"],
    ["unsupported parser", { parser: new Error("unsupported-content-type") }, "unsupported-content-type"],
  ] as const)("maps %s failures without exposing private detail", async (_label, failure, code) => {
    const fakes = dependencies();
    if ("download" in failure) {
      fakes.storage.download.mockRejectedValueOnce(failure.download);
    }
    if ("parser" in failure) fakes.parser.mockRejectedValueOnce(failure.parser);
    const result = await createJDGapComparisonService(fakes).run(input());
    expect(result.run.errorCode).toBe(code);
    expect(result.run.errorMessage).not.toContain("private storage detail");
    expect(fakes.providerFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["deepseek-api-key-missing", "jd-gap-unavailable"],
    ["ai-provider-authentication-failed", "jd-gap-unavailable"],
    ["ai-provider-timeout", "ai-provider-timeout"],
    ["private provider body", "jd-gap-failed"],
  ] as const)("maps provider %s to %s", async (message, code) => {
    const fakes = dependencies();
    fakes.provider.compareJDGapCriteria.mockRejectedValueOnce(new Error(message));
    const result = await createJDGapComparisonService(fakes).run(input({ ocrText: resumeText }));
    expect(result.run.errorCode).toBe(code);
    expect(result.run.errorMessage).not.toContain(message);
  });

  it("preserves a preceding success when completion loses a write race", async () => {
    const fakes = dependencies();
    fakes.runs.complete.mockRejectedValueOnce(new Error("stale write"));
    fakes.runs.getOwned
      .mockResolvedValueOnce({ ...run, status: "running", attemptCount: 1 })
      .mockResolvedValueOnce(succeeded({ attemptCount: 2 }));
    const result = await createJDGapComparisonService(fakes).run(input({ ocrText: resumeText }));
    expect(result).toMatchObject({ reused: true, run: { status: "succeeded", attemptCount: 2 } });
    expect(fakes.runs.fail).not.toHaveBeenCalled();
  });
});
