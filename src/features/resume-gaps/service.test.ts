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
});
