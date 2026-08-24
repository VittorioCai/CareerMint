// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { SourceAsset } from "@/features/source-assets/repository";
import { createResumeGapService } from "./service";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const appId = "11111111-1111-4111-8111-111111111111";
const analysisId = "22222222-2222-4222-8222-222222222222";
const runId = "44444444-4444-4444-8444-444444444444";
const requirementId = "55555555-5555-4555-8555-555555555555";
const asset: SourceAsset = {
  id: "33333333-3333-4333-8333-333333333333",
  userId,
  originalName: "resume.pdf",
  contentType: "application/pdf",
  storagePath: `${userId}/asset/source.pdf`,
  sizeBytes: 12,
  sha256: "a".repeat(64),
  status: "ready",
  errorCode: null,
  createdAt: "2026-08-24T00:00:00.000Z",
};
const run = {
  id: runId,
  applicationId: appId,
  userId,
  analysisRunId: analysisId,
  sourceAssetId: asset.id,
  sourceFilename: asset.originalName,
  sourceSha256: asset.sha256,
  inputHash: "b".repeat(64),
  provider: "deepseek",
  model: "deepseek-chat",
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
const requirements = [{
  id: requirementId,
  analysisRunId: analysisId,
  applicationId: appId,
  category: "skill" as const,
  text: "Advanced SQL",
  priority: "core" as const,
}];
const analysisRun = { id: analysisId, applicationId: appId, userId, status: "succeeded" as const };

function dependencies() {
  const claimed = { ...run, status: "running" as const, attemptCount: 1, startedAt: run.createdAt };
  return {
    runs: {
      claim: vi.fn().mockResolvedValue(true),
      getOwned: vi.fn().mockResolvedValue(claimed),
      complete: vi.fn().mockResolvedValue({ ...claimed, status: "succeeded", result: {} }),
      fail: vi.fn().mockImplementation(async (input: { errorCode: string; errorMessage: string }) => ({ ...claimed, status: "failed", errorCode: input.errorCode, errorMessage: input.errorMessage })),
    },
    storage: { download: vi.fn().mockResolvedValue(new Blob(["pdf"])) },
    parser: vi.fn().mockResolvedValue("Advanced SQL and analytics experience with measurable outcomes."),
    providerFactory: vi.fn().mockReturnValue({
      analyzeResumeGaps: vi.fn().mockResolvedValue({
        data: { items: [{ requirementId, resumeCoverage: "covered", resumeExcerpt: "Advanced SQL" }] },
        provider: "deepseek",
        model: "deepseek-chat",
        requestId: " unsafe id ",
        usage: { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3 },
      }),
    }),
    priceSchedule: undefined as import("@/features/ai/pricing").AIPriceSchedule | undefined,
    clock: () => new Date("2026-08-24T00:00:00.000Z"),
  };
}

describe("resume gap service", () => {
  it("claims before constructing a provider and uses validated OCR instead of private download/parse", async () => {
    const fakes = dependencies();
    const service = createResumeGapService(fakes);
    const result = await service.run({
      userId,
      run,
      asset,
      analysisRun,
      requirements,
      ocrText: "  Advanced\tSQL and analytics experience with measurable outcomes.  ",
    });

    expect(fakes.runs.claim).toHaveBeenCalledWith(runId, 120);
    expect(fakes.storage.download).not.toHaveBeenCalled();
    expect(fakes.parser).not.toHaveBeenCalled();
    expect(fakes.providerFactory).toHaveBeenCalledTimes(1);
    expect(result.reused).toBe(false);
    expect(fakes.runs.complete).toHaveBeenCalledWith(expect.objectContaining({ expectedAttemptCount: 1 }));
  });

  it("fails invalid provider output once without a second provider call", async () => {
    const fakes = dependencies();
    const provider = { analyzeResumeGaps: vi.fn().mockResolvedValue({
      data: { items: [] },
      provider: "deepseek",
      model: "deepseek-chat",
      requestId: null,
      usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 0, outputTokens: 0 },
    }) };
    fakes.providerFactory.mockReturnValue(provider);
    const service = createResumeGapService(fakes);
    const result = await service.run({ userId, run, asset, analysisRun, requirements, ocrText: "Advanced SQL and analytics experience with measurable outcomes." });

    expect(result.run.status).toBe("failed");
    expect(result.run.errorCode).toBe("resume-gap-invalid-output");
    expect(provider.analyzeResumeGaps).toHaveBeenCalledTimes(1);
    expect(fakes.runs.fail).toHaveBeenCalledTimes(1);
  });

  it("returns an existing succeeded run without parsing or provider creation", async () => {
    const fakes = dependencies();
    const succeeded = { ...run, status: "succeeded" as const, attemptCount: 1, startedAt: run.createdAt, finishedAt: run.createdAt, result: {} as never };
    fakes.runs.getOwned.mockResolvedValue(succeeded);
    const service = createResumeGapService(fakes);
    const result = await service.run({ userId, run: succeeded, asset, analysisRun, requirements });
    expect(result.reused).toBe(true);
    expect(fakes.runs.claim).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["fresh", false, 1],
    ["stale", true, 2],
  ] as const)("uses claim to deduplicate a %s running lease", async (_label, claimResult, attemptCount) => {
    const fakes = dependencies();
    const running = { ...run, status: "running" as const, attemptCount: 1, startedAt: run.createdAt };
    fakes.runs.claim.mockResolvedValue(claimResult);
    fakes.runs.getOwned.mockResolvedValue(
      claimResult
        ? { ...running, attemptCount, startedAt: run.createdAt }
        : running,
    );
    const service = createResumeGapService(fakes);
    const result = await service.run({ userId, run: running, asset, analysisRun, requirements, ocrText: "Advanced SQL and analytics experience with measurable outcomes." });
    expect(fakes.runs.claim).toHaveBeenCalledWith(runId, 120);
    if (!claimResult) {
      expect(result.reused).toBe(true);
      expect(fakes.storage.download).not.toHaveBeenCalled();
      expect(fakes.providerFactory).not.toHaveBeenCalled();
    } else {
      expect(result.reused).toBe(false);
      expect(fakes.providerFactory).toHaveBeenCalledTimes(1);
      expect(fakes.runs.complete).toHaveBeenCalledWith(expect.objectContaining({ expectedAttemptCount: 2 }));
    }
  });

  it("uses the reread claimed attempt token when another transition advanced it before reread", async () => {
    const fakes = dependencies();
    const running = { ...run, status: "running" as const, attemptCount: 1, startedAt: run.createdAt };
    fakes.runs.getOwned.mockResolvedValue({ ...running, attemptCount: 3 });
    const result = await createResumeGapService(fakes).run({ userId, run: running, asset, analysisRun, requirements, ocrText: "Advanced SQL and analytics experience with measurable outcomes." });
    expect(result.reused).toBe(false);
    expect(fakes.providerFactory).toHaveBeenCalledTimes(1);
    expect(fakes.runs.complete).toHaveBeenCalledWith(expect.objectContaining({ expectedAttemptCount: 3 }));
  });

  it("passes only the four provider fields and strips wider JD provenance/private fields", async () => {
    const fakes = dependencies();
    const provider = { analyzeResumeGaps: vi.fn().mockResolvedValue({
      data: { items: [{ requirementId, resumeCoverage: "covered", resumeExcerpt: "Advanced SQL" }] },
      provider: "deepseek", model: "deepseek-chat", requestId: null,
      usage: { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3 },
    }) };
    fakes.providerFactory.mockReturnValue(provider);
    const wide = [{ ...requirements[0], sourceExcerpt: "private JD", matchReason: "private reason", evidence: [{ sentinel: "private" }], profileSecret: "private" }];
    await createResumeGapService(fakes).run({ userId, run, asset, analysisRun, requirements: wide as never, ocrText: "Advanced SQL and analytics experience with measurable outcomes." });
    expect(provider.analyzeResumeGaps).toHaveBeenCalledWith({
      resumeText: "Advanced SQL and analytics experience with measurable outcomes.",
      requirements: [{ id: requirementId, category: "skill", text: "Advanced SQL", priority: "core" }],
    });
    expect(Object.keys(provider.analyzeResumeGaps.mock.calls[0][0].requirements[0])).toEqual(["id", "category", "text", "priority"]);
  });

  it("downloads and parses the private source with exact storage path/content type when OCR is absent", async () => {
    const fakes = dependencies();
    const bytes = Buffer.from("pdf-bytes");
    fakes.storage.download.mockResolvedValue(new Blob([bytes]));
    fakes.parser.mockResolvedValue("Advanced SQL and analytics experience with measurable outcomes.");
    const result = await createResumeGapService(fakes).run({ userId, run, asset, analysisRun, requirements });
    expect(result.reused).toBe(false);
    expect(fakes.storage.download).toHaveBeenCalledWith(asset.storagePath);
    expect(fakes.parser).toHaveBeenCalledWith(bytes, asset.contentType);
  });

  it.each([
    ["provider mismatch", { provider: "other", model: "deepseek-chat" }, "resume-gap-failed"],
    ["model mismatch", { provider: "deepseek", model: "other" }, "resume-gap-failed"],
    ["invalid usage", { provider: "deepseek", model: "deepseek-chat", usage: { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3, extra: 4 } }, "resume-gap-failed"],
  ] as const)("rejects %s before complete", async (_label, ai, errorCode) => {
    const fakes = dependencies();
    const provider = { analyzeResumeGaps: vi.fn().mockResolvedValue({
      data: { items: [{ requirementId, resumeCoverage: "covered", resumeExcerpt: "Advanced SQL" }] },
      provider: ai.provider ?? "deepseek",
      model: ai.model ?? "deepseek-chat",
      requestId: null,
      usage: (ai as { usage?: { inputCacheHitTokens: number; inputCacheMissTokens: number; outputTokens: number } }).usage ?? { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3 },
    }) };
    fakes.providerFactory.mockReturnValue(provider);
    const service = createResumeGapService(fakes);
    const result = await service.run({ userId, run, asset, analysisRun, requirements, ocrText: "Advanced SQL and analytics experience with measurable outcomes." });
    expect(result.run.errorCode).toBe(errorCode);
    expect(fakes.runs.complete).not.toHaveBeenCalled();
    expect(fakes.runs.fail).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["wrong user", { run: { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }],
    ["wrong application", { run: { applicationId: "66666666-6666-4666-8666-666666666666" } }],
    ["wrong analysis", { run: { analysisRunId: "66666666-6666-4666-8666-666666666666" } }],
    ["wrong asset user", { asset: { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }],
    ["wrong asset hash", { asset: { sha256: "c".repeat(64) } }],
    ["wrong filename", { asset: { originalName: "other.pdf" } }],
    ["non-succeeded JD", { analysisRun: { status: "failed" as const } }],
  ] as const)("rejects %s before claim, storage, or provider construction", async (_label, change) => {
    const fakes = dependencies();
    const service = createResumeGapService(fakes);
    await expect(service.run({
      userId,
      run: { ...run, ...(change as { run?: Partial<typeof run> }).run },
      asset: { ...asset, ...(change as { asset?: Partial<typeof asset> }).asset },
      analysisRun: { ...analysisRun, ...(change as { analysisRun?: Partial<typeof analysisRun> }).analysisRun },
      requirements,
    })).rejects.toMatchObject({ message: "application-or-resume-not-found" });
    expect(fakes.runs.claim).not.toHaveBeenCalled();
    expect(fakes.storage.download).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
  });

  it("rejects empty requirements and requirements from another analysis before claim", async () => {
    const fakes = dependencies();
    const service = createResumeGapService(fakes);
    await expect(service.run({ userId, run, asset, analysisRun, requirements: [] })).rejects.toThrow("jd-analysis-required");
    await expect(service.run({ userId, run, asset, analysisRun, requirements: [{ ...requirements[0], analysisRunId: "66666666-6666-4666-8666-666666666666" } as never] })).rejects.toThrow("application-or-resume-not-found");
    expect(fakes.runs.claim).not.toHaveBeenCalled();
  });

  it.each([
    ["source-download-failed", new Error("source-download-failed")],
    ["unsupported-content-type", new Error("unsupported-content-type")],
    ["resume-text-too-short", new Error("resume-text-too-short")],
    ["resume-text-too-long", new Error("resume-text-too-long")],
    ["resume-gap-failed", new Error("parser blew up with private resume text")],
  ] as const)("maps parser/storage error %s safely", async (errorCode, error) => {
    const fakes = dependencies();
    if (errorCode === "source-download-failed") {
      fakes.storage.download.mockRejectedValue(error);
    } else {
      fakes.parser.mockRejectedValue(error);
    }
    const service = createResumeGapService(fakes);
    const result = await service.run({ userId, run, asset, analysisRun, requirements });
    expect(result.run.errorCode).toBe(errorCode);
    expect(result.run.errorMessage).not.toContain("private resume text");
    expect(fakes.providerFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["deepseek-api-key-missing", "resume-gap-unavailable"],
    ["ai-provider-authentication-failed", "resume-gap-unavailable"],
    ["ai-provider-rate-limited", "ai-provider-rate-limited"],
    ["ai-provider-timeout", "ai-provider-timeout"],
    ["ai-provider-request-failed", "ai-provider-request-failed"],
  ] as const)("maps provider %s to %s without private details", async (providerError, expected) => {
    const fakes = dependencies();
    fakes.providerFactory.mockReturnValue({ analyzeResumeGaps: vi.fn().mockRejectedValue(new Error(providerError)) });
    const result = await createResumeGapService(fakes).run({ userId, run, asset, analysisRun, requirements, ocrText: "Advanced SQL and analytics experience with measurable outcomes." });
    expect(result.run.errorCode).toBe(expected);
    expect(result.run.errorMessage).not.toContain("private body");
  });

  it("does not fail or complete an attempt after a newer attempt has taken the lease", async () => {
    const fakes = dependencies();
    fakes.runs.complete.mockRejectedValue(new Error("stale attempt"));
    fakes.runs.getOwned
      .mockResolvedValueOnce({ ...run, status: "running", attemptCount: 2, startedAt: run.createdAt })
      .mockResolvedValueOnce({ ...run, status: "running", attemptCount: 3, startedAt: run.createdAt });
    const result = await createResumeGapService(fakes).run({ userId, run: { ...run, status: "running", attemptCount: 1, startedAt: run.createdAt }, asset, analysisRun, requirements, ocrText: "Advanced SQL and analytics experience with measurable outcomes." });
    expect(result.reused).toBe(true);
    expect(result.run.attemptCount).toBe(3);
    expect(fakes.runs.fail).not.toHaveBeenCalled();
  });

  it.each([
    ["matching schedule", { provider: "deepseek", model: "deepseek-chat", version: "safe-v1", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: null }, true, "safe-v1"],
    ["mismatching provider", { provider: "other", model: "deepseek-chat", version: "safe-v1", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: null }, false, null],
    ["mismatching model", { provider: "deepseek", model: "other", version: "safe-v1", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: null }, false, null],
    ["unsafe request id and version", { provider: "deepseek", model: "deepseek-chat", version: "unsafe version!", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: null }, false, null],
    ["outside effective window", { provider: "deepseek", model: "deepseek-chat", version: "safe-v1", effectiveFrom: "2027-01-01T00:00:00.000Z", effectiveUntil: null }, false, null],
  ] as const)("persists pricing metadata only for %s", async (_label, settings, expectedCost, expectedVersion) => {
    const fakes = dependencies();
    fakes.priceSchedule = {
      ...settings,
      currency: "USD",
      observedAt: "2026-01-01T00:00:00.000Z",
      sourceUrl: "https://example.com/prices",
      peak: null,
      defaultRates: { inputCacheHitPerMillion: 1, inputCacheMissPerMillion: 2, outputPerMillion: 3 },
    };
    fakes.providerFactory.mockReturnValue({ analyzeResumeGaps: vi.fn().mockResolvedValue({
      data: { items: [{ requirementId, resumeCoverage: "covered", resumeExcerpt: "Advanced SQL" }] },
      provider: "deepseek",
      model: "deepseek-chat",
      requestId: "req_".repeat(100),
      usage: { inputCacheHitTokens: 10, inputCacheMissTokens: 20, outputTokens: 30 },
    }) });
    const result = await createResumeGapService(fakes).run({ userId, run, asset, analysisRun, requirements, ocrText: "Advanced SQL and analytics experience with measurable outcomes." });
    expect(result.run.status).toBe("succeeded");
    const completeInput = fakes.runs.complete.mock.calls[0][0];
    expect(completeInput.aiUsage.usage).toEqual({ inputCacheHitTokens: 10, inputCacheMissTokens: 20, outputTokens: 30 });
    expect(completeInput.aiUsage.requestId).toBeNull();
    expect(completeInput.aiUsage.priceScheduleVersion).toBe(expectedVersion);
    expect(Boolean(completeInput.estimatedCost)).toBe(expectedCost);
    if (completeInput.estimatedCost) expect(completeInput.estimatedCost.scheduleVersion).toBe(expectedVersion);
  });
});
