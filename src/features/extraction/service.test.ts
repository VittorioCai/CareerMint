// @vitest-environment node

import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import type { ExtractedFact } from "./service";
import { createResumeExtractionService } from "./service";
import { extractResumeText } from "@/features/source-assets/parsers";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const jobId = "33333333-3333-4333-8333-333333333333";
const assetId = "11111111-1111-4111-8111-111111111111";
const sourceText =
  "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";

const job = {
  id: jobId,
  userId,
  entityId: assetId,
  status: "queued" as const,
  attemptCount: 0,
  result: null,
  errorCode: null,
};

const asset = {
  id: assetId,
  userId,
  originalName: "resume.pdf",
  contentType: "application/pdf",
  storagePath: `${userId}/${assetId}/source.pdf`,
};

function fact(
  sourceExcerpt: string,
  needsDetailReason: string | null = null,
): ExtractedFact {
  return {
    factType: "achievement",
    data: {
      title: "Checkout conversion improvement",
      organization: null,
      startDate: null,
      endDate: null,
      description:
        "Improved checkout conversion by 18% through funnel analysis.",
      skills: [],
    },
    sourceExcerpt,
    needsDetailReason,
  };
}

function createFakes(extractedFacts: ExtractedFact[]) {
  const inserted: Array<ExtractedFact & { confirmationStatus: string }> = [];
  const jobs = {
    claimJob: vi.fn().mockResolvedValue(true),
    getOwnedJob: vi.fn().mockResolvedValue(job),
    succeedJob: vi.fn().mockImplementation(async (input) => {
      inserted.push(
        ...input.acceptedFacts.map((candidate: ExtractedFact) => ({
          ...candidate,
          confirmationStatus: candidate.needsDetailReason
            ? "needs_detail"
            : "pending",
        })),
      );
      return {
        ...job,
        status: "succeeded",
        result: {
          acceptedCount: input.acceptedCount,
          rejectedCount: input.rejectedCount,
          ai: input.aiUsage,
          estimatedCost: input.estimatedCost,
        },
      };
    }),
    failJob: vi.fn().mockImplementation(async (input) => ({
      ...job,
      status: "failed",
      errorCode: input.errorCode,
    })),
  };
  const assets = { setStatus: vi.fn().mockResolvedValue(undefined) };
  const storage = {
    download: vi.fn().mockResolvedValue(new Blob([sourceText])),
  };
  const parser = vi.fn().mockResolvedValue(sourceText);
  const provider = {
    extractResumeFacts: vi.fn().mockResolvedValue({
      data: { facts: extractedFacts },
      provider: "test-provider",
      model: "test-model",
      requestId: "request-123",
      usage: {
        inputCacheHitTokens: 10,
        inputCacheMissTokens: 20,
        outputTokens: 30,
      },
    }),
  };

  return { jobs, assets, storage, parser, provider, inserted };
}

const syntheticSchedule = {
  version: "synthetic-v1",
  provider: "test-provider",
  model: "test-model",
  currency: "USD" as const,
  observedAt: "2026-08-01T00:00:00.000Z",
  sourceUrl: "https://example.com/official-pricing",
  effectiveFrom: "2026-08-02T00:00:00.000Z",
  effectiveUntil: "2026-09-01T00:00:00.000Z",
  defaultRates: {
    inputCacheHitPerMillion: 1,
    inputCacheMissPerMillion: 2,
    outputPerMillion: 3,
  },
  peak: null,
};

describe("resume extraction service", () => {
  it("preserves resume-text-too-short from the real scanned PDF parser", async () => {
    const fakes = createFakes([]);
    const scannedPdf = await readFile("tests/fixtures/resume-scanned.pdf");
    fakes.storage.download.mockResolvedValue(new Blob([scannedPdf]));
    fakes.parser.mockImplementation((buffer, contentType) => {
      expect(contentType).toBe("application/pdf");
      return extractResumeText(buffer, contentType);
    });
    const service = createResumeExtractionService({ ...fakes });

    const failed = await service.run({ userId, job, asset });
    expect(fakes.jobs.failJob).toHaveBeenCalledWith({
      jobId,
      assetId,
      errorCode: "resume-text-too-short",
      errorMessage: "简历处理失败，请稍后重试。",
    });
    expect(failed.errorCode).toBe("resume-text-too-short");
  });

  it("claims once, rejects unsupported evidence, and persists safe metadata", async () => {
    const supported = fact(
      "Improved checkout conversion by 18% through funnel analysis.",
    );
    const invented = fact("Improved conversion by an invented 95 percent.");
    const fakes = createFakes([supported, invented]);
    const service = createResumeExtractionService({
      ...fakes,
      priceSchedule: syntheticSchedule,
      clock: () => new Date("2026-08-14T12:00:00.000Z"),
    });

    const completed = await service.run({ userId, job, asset });

    expect(fakes.jobs.claimJob).toHaveBeenCalledOnce();
    expect(fakes.assets.setStatus).toHaveBeenCalledWith(
      userId,
      assetId,
      "extracting",
      null,
    );
    expect(fakes.jobs.succeedJob).toHaveBeenCalledOnce();
    expect(fakes.inserted).toEqual([
      expect.objectContaining({
        sourceExcerpt: supported.sourceExcerpt,
        confirmationStatus: "pending",
      }),
    ]);
    expect(completed.result).toEqual({
      acceptedCount: 1,
      rejectedCount: 1,
      ai: {
        provider: "test-provider",
        model: "test-model",
        requestId: "request-123",
        usage: {
          inputCacheHitTokens: 10,
          inputCacheMissTokens: 20,
          outputTokens: 30,
        },
        priceScheduleVersion: "synthetic-v1",
      },
      estimatedCost: {
        amount: 0.00014,
        currency: "USD",
        scheduleVersion: "synthetic-v1",
        tier: "default",
      },
    });
    const serialized = JSON.stringify(completed.result);
    expect(serialized).not.toContain(sourceText);
    expect(serialized).not.toContain("resume_document");
  });

  it("marks supported facts needing context as needs_detail", async () => {
    const fakes = createFakes([
      fact(
        "Improved checkout conversion by 18% through funnel analysis.",
        "Add the traffic scale and analysis period.",
      ),
    ]);
    const service = createResumeExtractionService({
      ...fakes,
      clock: () => new Date("2026-08-14T12:00:00.000Z"),
    });

    await service.run({ userId, job, asset });

    expect(fakes.inserted[0].confirmationStatus).toBe("needs_detail");
  });

  it("marks both records failed with sanitized errors and no source content", async () => {
    const fakes = createFakes([]);
    fakes.parser.mockRejectedValue(
      new Error(`resume-text-too-short: ${sourceText}`),
    );
    const service = createResumeExtractionService({
      ...fakes,
      clock: () => new Date("2026-08-14T12:00:00.000Z"),
    });

    const failed = await service.run({ userId, job, asset });

    expect(fakes.jobs.failJob).toHaveBeenCalledWith({
      jobId,
      assetId,
      errorCode: "resume-extraction-failed",
      errorMessage: "简历处理失败，请稍后重试。",
    });
    expect(fakes.assets.setStatus).not.toHaveBeenCalledWith(
      userId,
      assetId,
      "failed",
      expect.anything(),
    );
    expect(JSON.stringify(fakes.jobs.failJob.mock.calls)).not.toContain(
      sourceText,
    );
    expect(failed.status).toBe("failed");
  });

  it("uses supplied OCR text without downloading or parsing, while checking evidence", async () => {
    const supported = fact(
      "Improved checkout conversion by 18% through funnel analysis.",
    );
    const invented = fact("Invented achievement not present in the resume.");
    const fakes = createFakes([supported, invented]);
    const ocrText =
      "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";
    const service = createResumeExtractionService({
      ...fakes,
      priceSchedule: syntheticSchedule,
      clock: () => new Date("2026-08-14T12:00:00.000Z"),
    });

    const completed = await service.run({ userId, job, asset, sourceText: ocrText });

    expect(fakes.storage.download).not.toHaveBeenCalled();
    expect(fakes.parser).not.toHaveBeenCalled();
    expect(fakes.provider.extractResumeFacts).toHaveBeenCalledWith(ocrText);
    expect(fakes.jobs.succeedJob).toHaveBeenCalledOnce();
    expect(completed.result?.acceptedCount).toBe(1);
    expect(completed.result?.rejectedCount).toBe(1);
    expect(JSON.stringify(completed.result)).not.toContain(ocrText);
  });

  it("sanitizes OCR processing errors without persisting source text", async () => {
    const fakes = createFakes([]);
    const ocrText =
      "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";
    fakes.provider.extractResumeFacts.mockRejectedValue(
      new Error(`provider failed: ${ocrText}`),
    );
    const service = createResumeExtractionService({ ...fakes });

    const failed = await service.run({ userId, job, asset, sourceText: ocrText });

    expect(fakes.jobs.failJob).toHaveBeenCalledWith({
      jobId,
      assetId,
      errorCode: "resume-extraction-failed",
      errorMessage: "简历处理失败，请稍后重试。",
    });
    expect(JSON.stringify(fakes.jobs.failJob.mock.calls)).not.toContain(ocrText);
    expect(failed.status).toBe("failed");
  });

  it("normalizes supplied OCR text before provider and evidence processing", async () => {
    const supported = fact(
      "Improved checkout conversion by 18% through funnel analysis.",
    );
    const fakes = createFakes([supported]);
    const rawOCRText =
      " Product Analyst\r\n  Improved checkout conversion by 18% through funnel analysis.  ";
    const normalizedOCRText =
      "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";
    const service = createResumeExtractionService({ ...fakes });

    const completed = await service.run({
      userId,
      job,
      asset,
      sourceText: rawOCRText,
    });

    expect(fakes.storage.download).not.toHaveBeenCalled();
    expect(fakes.parser).not.toHaveBeenCalled();
    expect(fakes.provider.extractResumeFacts).toHaveBeenCalledWith(
      normalizedOCRText,
    );
    expect(fakes.jobs.succeedJob).toHaveBeenCalledOnce();
    expect(completed.status).toBe("succeeded");
  });

  it.each([
    ["blank", "   \r\n   ", "resume-text-too-short"],
    ["too long", "x".repeat(100_001), "resume-text-too-long"],
  ])(
    "safely fails invalid supplied OCR text (%s) without storage or provider calls",
    async (_name, invalidOCRText, errorCode) => {
      const fakes = createFakes([]);
      const service = createResumeExtractionService({ ...fakes });

      const failed = await service.run({
        userId,
        job,
        asset,
        sourceText: invalidOCRText,
      });

      expect(fakes.storage.download).not.toHaveBeenCalled();
      expect(fakes.parser).not.toHaveBeenCalled();
      expect(fakes.provider.extractResumeFacts).not.toHaveBeenCalled();
      expect(fakes.jobs.failJob).toHaveBeenCalledWith({
        jobId,
        assetId,
        errorCode,
        errorMessage: "简历处理失败，请稍后重试。",
      });
      expect(JSON.stringify(fakes.jobs.failJob.mock.calls)).not.toContain(
        invalidOCRText,
      );
      expect(failed.status).toBe("failed");
    },
  );
});
