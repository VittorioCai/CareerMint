// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getOwnedAsset: vi.fn(),
  getAIProcessingConsentAt: vi.fn(),
  createOrGetJob: vi.fn(),
  createResumeExtractionService: vi.fn(),
  serviceRun: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("@/features/account/repository", () => ({
  getAIProcessingConsentAt: mocks.getAIProcessingConsentAt,
}));
vi.mock("@/features/extraction/deepseek-extractor", () => ({
  createDeepSeekAIProvider: vi.fn(),
}));
vi.mock("@/features/extraction/service", () => ({
  createResumeExtractionService: mocks.createResumeExtractionService,
}));
vi.mock("@/features/jobs/repository", () => ({
  claimJob: vi.fn(),
  createOrGetJob: mocks.createOrGetJob,
  failJob: vi.fn(),
  getOwnedJob: vi.fn(),
  succeedJob: vi.fn(),
}));
vi.mock("@/features/source-assets/repository", () => ({
  getOwnedAsset: mocks.getOwnedAsset,
  setAssetStatus: vi.fn(),
}));
vi.mock("@/features/source-assets/parsers", () => ({
  extractResumeText: vi.fn(),
  normalizeResumeText: (rawText: string) =>
    rawText
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
}));
vi.mock("@/features/source-assets/storage", () => ({
  downloadSource: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: mocks.getServerEnv,
}));

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assetId = "11111111-1111-4111-8111-111111111111";
const jobId = "33333333-3333-4333-8333-333333333333";
const asset = {
  id: assetId,
  userId,
  originalName: "resume.pdf",
  contentType: "application/pdf",
  storagePath: `${userId}/${assetId}/source.pdf`,
};
const queuedJob = {
  id: jobId,
  userId,
  entityId: assetId,
  status: "queued" as const,
  attemptCount: 0,
  result: null,
  errorCode: null,
};

describe("POST route wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: userId });
    mocks.getOwnedAsset.mockResolvedValue(asset);
    mocks.getAIProcessingConsentAt.mockResolvedValue(
      "2026-08-14T00:00:00.000Z",
    );
    mocks.createOrGetJob.mockResolvedValue(queuedJob);
    mocks.getServerEnv.mockReturnValue({ E2E_FAKE_EXTRACTOR: "1" });
    mocks.serviceRun.mockResolvedValue({ ...queuedJob, status: "succeeded" });
    mocks.createResumeExtractionService.mockReturnValue({
      run: mocks.serviceRun,
    });
  });

  it("passes normalized OCR text through the production route adapter", async () => {
    const { POST } = await import("./route");
    const rawOCRText =
      " Product Analyst\r\n  Improved checkout conversion by 18% through funnel analysis.  ";
    const normalizedOCRText =
      "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";

    const response = await POST(
      new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ocrText: rawOCRText }),
      }),
      { params: Promise.resolve({ id: assetId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.createResumeExtractionService).toHaveBeenCalledOnce();
    expect(mocks.serviceRun).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        job: queuedJob,
        asset,
        sourceText: normalizedOCRText,
      }),
    );
  });
});
