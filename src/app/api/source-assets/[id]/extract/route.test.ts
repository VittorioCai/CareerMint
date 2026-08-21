// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSourceAssetExtractPostHandler } from "@/features/extraction/http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assetId = "11111111-1111-4111-8111-111111111111";
const jobId = "33333333-3333-4333-8333-333333333333";

const asset = {
  id: assetId,
  userId,
  originalName: "resume.pdf",
  contentType: "application/pdf",
  storagePath: `${userId}/${assetId}/source.pdf`,
  sizeBytes: 100,
  sha256: "a".repeat(64),
  status: "uploaded" as const,
  errorCode: null,
  createdAt: "2026-08-14T00:00:00.000Z",
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

function createFakes() {
  const provider = {
    extractResumeFacts: vi.fn().mockResolvedValue({
      data: { facts: [] },
      provider: "fake",
      model: "fake",
      requestId: null,
      usage: {
        inputCacheHitTokens: 0,
        inputCacheMissTokens: 0,
        outputTokens: 0,
      },
    }),
  };
  const providerFactory = vi.fn().mockReturnValue(provider);
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: userId }),
    getOwnedAsset: vi.fn().mockResolvedValue(asset),
    getAIProcessingConsentAt: vi.fn().mockResolvedValue(null),
    createOrGetJob: vi.fn().mockResolvedValue(queuedJob),
    providerFactory,
    runExtraction: vi.fn().mockImplementation(async (input) => {
      await input.provider.extractResumeFacts("synthetic resume text");
      return { ...queuedJob, status: "succeeded" };
    }),
    provider,
  };
}

function context() {
  return { params: Promise.resolve({ id: assetId }) };
}

function streamingJSONRequest(body: string, contentLength?: string) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const nextOffset = Math.min(offset + 64 * 1024, bytes.byteLength);
      controller.enqueue(bytes.slice(offset, nextOffset));
      offset = nextOffset;
    },
  });
  const headers = new Headers({ "content-type": "application/json" });
  if (contentLength !== undefined) {
    headers.set("content-length", contentLength);
  }
  return new Request(
    `http://localhost/api/source-assets/${assetId}/extract`,
    {
      method: "POST",
      headers,
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" },
  );
}

describe("POST /api/source-assets/[id]/extract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks AI processing before consent without creating or calling anything", async () => {
    const fakes = createFakes();
    const post = createSourceAssetExtractPostHandler(fakes);

    const response = await post(
      new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
        method: "POST",
      }),
      context(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "ai-processing-consent-required",
    });
    expect(fakes.createOrGetJob).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
    expect(fakes.provider.extractResumeFacts).not.toHaveBeenCalled();
  });

  it("checks authentication before parsing malformed OCR JSON", async () => {
    const fakes = createFakes();
    fakes.getCurrentUser.mockResolvedValue(null);
    const post = createSourceAssetExtractPostHandler(fakes);

    const response = await post(
      new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      context(),
    );

    expect(response.status).toBe(401);
    expect(fakes.getOwnedAsset).not.toHaveBeenCalled();
    expect(fakes.getAIProcessingConsentAt).not.toHaveBeenCalled();
    expect(fakes.createOrGetJob).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
    expect(fakes.runExtraction).not.toHaveBeenCalled();
  });

  it("checks asset ownership before parsing malformed OCR JSON", async () => {
    const fakes = createFakes();
    fakes.getOwnedAsset.mockResolvedValue(null);
    const post = createSourceAssetExtractPostHandler(fakes);

    const response = await post(
      new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      context(),
    );

    expect(response.status).toBe(404);
    expect(fakes.getAIProcessingConsentAt).not.toHaveBeenCalled();
    expect(fakes.createOrGetJob).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
    expect(fakes.runExtraction).not.toHaveBeenCalled();
  });

  it("checks AI consent before parsing malformed OCR JSON", async () => {
    const fakes = createFakes();
    const post = createSourceAssetExtractPostHandler(fakes);

    const response = await post(
      new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      context(),
    );

    expect(response.status).toBe(403);
    expect(fakes.createOrGetJob).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
    expect(fakes.runExtraction).not.toHaveBeenCalled();
  });

  it("enters normal idempotent processing after consent", async () => {
    const fakes = createFakes();
    fakes.getAIProcessingConsentAt.mockResolvedValue(
      "2026-08-14T00:00:00.000Z",
    );
    const post = createSourceAssetExtractPostHandler(fakes);

    const response = await post(
      new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
        method: "POST",
      }),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId,
      status: "succeeded",
    });
    expect(fakes.createOrGetJob).toHaveBeenCalledWith(
      assetId,
      `source-asset:${assetId}:resume-extract:v1`,
    );
    expect(fakes.runExtraction).toHaveBeenCalledOnce();
    expect(fakes.provider.extractResumeFacts).toHaveBeenCalledOnce();
  });

  it("returns a sanitized failure code for immediate extraction failures", async () => {
    const fakes = createFakes();
    fakes.getAIProcessingConsentAt.mockResolvedValue(
      "2026-08-14T00:00:00.000Z",
    );
    fakes.runExtraction.mockResolvedValue({
      ...queuedJob,
      status: "failed",
      errorCode: "resume-text-too-short",
    });
    const post = createSourceAssetExtractPostHandler(fakes);

    const response = await post(
      new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
        method: "POST",
      }),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId,
      status: "failed",
      errorCode: "resume-text-too-short",
    });
  });

  it("accepts valid OCR text with a versioned OCR idempotency key", async () => {
    const fakes = createFakes();
    fakes.getAIProcessingConsentAt.mockResolvedValue(
      "2026-08-14T00:00:00.000Z",
    );
    const ocrText =
      "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";
    const post = createSourceAssetExtractPostHandler(fakes);

    const response = await post(
      new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ocrText }),
      }),
      context(),
    );

    expect(response.status).toBe(200);
    const responseBody = await response.text();
    expect(responseBody).not.toContain(ocrText);
    expect(fakes.createOrGetJob).toHaveBeenCalledWith(
      assetId,
      `source-asset:${assetId}:resume-extract:ocr:v1`,
    );
    expect(fakes.runExtraction).toHaveBeenCalledWith(
      expect.objectContaining({ sourceText: ocrText }),
    );
  });

  it.each([
    ["malformed JSON", "{", "application/json"],
    ["non-string OCR text", JSON.stringify({ ocrText: 42 }), "application/json"],
    ["short OCR text", JSON.stringify({ ocrText: "too short" }), "application/json"],
    [
      "long OCR text",
      JSON.stringify({ ocrText: "x".repeat(100_001) }),
      "application/json",
    ],
  ])(
    "rejects %s before creating a job or provider",
    async (_name, body, contentType) => {
      const fakes = createFakes();
      fakes.getAIProcessingConsentAt.mockResolvedValue(
        "2026-08-14T00:00:00.000Z",
      );
      const post = createSourceAssetExtractPostHandler(fakes);

      const response = await post(
        new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
          method: "POST",
          headers: { "content-type": contentType },
          body,
        }),
        context(),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "invalid-ocr-text",
      });
      expect(fakes.createOrGetJob).not.toHaveBeenCalled();
      expect(fakes.providerFactory).not.toHaveBeenCalled();
      expect(fakes.runExtraction).not.toHaveBeenCalled();
    },
  );

  it("treats an empty or non-JSON request as legacy extraction", async () => {
    const fakes = createFakes();
    fakes.getAIProcessingConsentAt.mockResolvedValue(
      "2026-08-14T00:00:00.000Z",
    );
    const post = createSourceAssetExtractPostHandler(fakes);

    for (const request of [
      new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
        method: "POST",
      }),
      new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not JSON",
      }),
    ]) {
      const response = await post(request, context());
      expect(response.status).toBe(200);
    }

    expect(fakes.createOrGetJob).toHaveBeenNthCalledWith(
      1,
      assetId,
      `source-asset:${assetId}:resume-extract:v1`,
    );
    expect(fakes.createOrGetJob).toHaveBeenNthCalledWith(
      2,
      assetId,
      `source-asset:${assetId}:resume-extract:v1`,
    );
    expect(fakes.runExtraction).toHaveBeenCalledWith(
      expect.not.objectContaining({ sourceText: expect.anything() }),
    );
  });

  it("rejects a declared oversized JSON body without reading or creating work", async () => {
    const fakes = createFakes();
    fakes.getAIProcessingConsentAt.mockResolvedValue(
      "2026-08-14T00:00:00.000Z",
    );
    const padding = "declared-size-padding";
    const post = createSourceAssetExtractPostHandler(fakes);

    const response = await post(
      streamingJSONRequest(JSON.stringify({ padding }), "1048577"),
      context(),
    );

    expect(response.status).toBe(413);
    const responseBody = await response.text();
    expect(responseBody).toBe('{"error":"ocr-request-too-large"}');
    expect(responseBody).not.toContain(padding);
    expect(fakes.createOrGetJob).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
    expect(fakes.runExtraction).not.toHaveBeenCalled();
  });

  it.each([
    ["without Content-Length", undefined],
    ["with a falsely small Content-Length", "1"],
  ])(
    "rejects an actual JSON body over 1 MiB %s",
    async (_name, contentLength) => {
      const fakes = createFakes();
      fakes.getAIProcessingConsentAt.mockResolvedValue(
        "2026-08-14T00:00:00.000Z",
      );
      const padding = "x".repeat(1_048_577);
      const post = createSourceAssetExtractPostHandler(fakes);

      const response = await post(
        streamingJSONRequest(JSON.stringify({ padding }), contentLength),
        context(),
      );

      expect(response.status).toBe(413);
      const responseBody = await response.text();
      expect(responseBody).toBe('{"error":"ocr-request-too-large"}');
      expect(responseBody).not.toContain(padding);
      expect(fakes.createOrGetJob).not.toHaveBeenCalled();
      expect(fakes.providerFactory).not.toHaveBeenCalled();
      expect(fakes.runExtraction).not.toHaveBeenCalled();
    },
  );

  it("rejects valid OCR JSON with oversized padding before creating work", async () => {
    const fakes = createFakes();
    fakes.getAIProcessingConsentAt.mockResolvedValue(
      "2026-08-14T00:00:00.000Z",
    );
    const ocrText =
      "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";
    const padding = "padding-secret-".repeat(100_000);
    const post = createSourceAssetExtractPostHandler(fakes);

    const response = await post(
      streamingJSONRequest(JSON.stringify({ ocrText, padding })),
      context(),
    );

    expect(response.status).toBe(413);
    const responseBody = await response.text();
    expect(responseBody).not.toContain(ocrText);
    expect(responseBody).not.toContain(padding);
    expect(fakes.createOrGetJob).not.toHaveBeenCalled();
    expect(fakes.providerFactory).not.toHaveBeenCalled();
    expect(fakes.runExtraction).not.toHaveBeenCalled();
  });

  it.each([40, 100_000])(
    "accepts OCR text at the exact %i-character boundary",
    async (length) => {
      const fakes = createFakes();
      fakes.getAIProcessingConsentAt.mockResolvedValue(
        "2026-08-14T00:00:00.000Z",
      );
      const ocrText = "x".repeat(length);
      const post = createSourceAssetExtractPostHandler(fakes);

      const response = await post(
        new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ocrText }),
        }),
        context(),
      );

      expect(response.status).toBe(200);
      expect(fakes.runExtraction).toHaveBeenCalledWith(
        expect.objectContaining({ sourceText: ocrText }),
      );
    },
  );

  it.each(["running", "succeeded"] as const)(
    "returns an existing %s job without rerunning",
    async (status) => {
      const fakes = createFakes();
      fakes.getAIProcessingConsentAt.mockResolvedValue(
        "2026-08-14T00:00:00.000Z",
      );
      fakes.createOrGetJob.mockResolvedValue({ ...queuedJob, status });
      const post = createSourceAssetExtractPostHandler(fakes);

      const response = await post(
        new Request(`http://localhost/api/source-assets/${assetId}/extract`, {
          method: "POST",
        }),
        context(),
      );

      await expect(response.json()).resolves.toEqual({ jobId, status });
      expect(fakes.runExtraction).not.toHaveBeenCalled();
      expect(fakes.providerFactory).not.toHaveBeenCalled();
    },
  );
});
