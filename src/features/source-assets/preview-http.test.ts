// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSourceAssetPreviewHandler } from "./preview-http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assetId = "11111111-1111-4111-8111-111111111111";

function asset(contentType = "application/pdf", originalName = "resume.pdf") {
  return {
    id: assetId,
    userId,
    originalName,
    contentType,
    storagePath: `${userId}/${assetId}/source.pdf`,
    sizeBytes: 4,
    sha256: "a".repeat(64),
    duplicateOfId: null,
    status: "ready" as const,
    errorCode: null,
    createdAt: "2026-08-24T00:00:00.000Z",
  };
}

function fakes() {
  return {
    requireUser: vi.fn().mockResolvedValue({ id: userId }),
    getOwnedAsset: vi.fn().mockResolvedValue(asset()),
    downloadSource: vi.fn().mockResolvedValue(new Blob(["%PDF"])),
    extractDocxText: vi.fn().mockResolvedValue("Product Manager\u0000\nSQL"),
  };
}

function request() {
  return new Request(`http://localhost/api/source-assets/${assetId}/preview`);
}

describe("source asset preview handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication before reading an asset", async () => {
    const deps = fakes();
    deps.requireUser.mockResolvedValue(null);
    const get = createSourceAssetPreviewHandler(deps);

    const response = await get(request(), { params: Promise.resolve({ id: assetId }) });

    expect(response.status).toBe(401);
    expect(deps.getOwnedAsset).not.toHaveBeenCalled();
  });

  it("returns not found for an invalid or unowned asset", async () => {
    const deps = fakes();
    deps.getOwnedAsset.mockResolvedValue(null);
    const get = createSourceAssetPreviewHandler(deps);

    const response = await get(request(), { params: Promise.resolve({ id: assetId }) });

    expect(response.status).toBe(404);
    expect(deps.getOwnedAsset).toHaveBeenCalledWith(userId, assetId);
    expect(deps.downloadSource).not.toHaveBeenCalled();
  });

  it("streams an owned PDF inline with private defensive headers", async () => {
    const deps = fakes();
    const get = createSourceAssetPreviewHandler(deps);

    const response = await get(request(), { params: Promise.resolve({ id: assetId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("content-disposition")).toContain("resume.pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("%PDF");
    expect(deps.extractDocxText).not.toHaveBeenCalled();
  });

  it("renders DOCX as sanitized plain text without AI or OCR", async () => {
    const deps = fakes();
    deps.getOwnedAsset.mockResolvedValue(
      asset(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "résumé.docx",
      ),
    );
    deps.downloadSource.mockResolvedValue(new Blob(["docx-bytes"]));
    const get = createSourceAssetPreviewHandler(deps);

    const response = await get(request(), { params: Promise.resolve({ id: assetId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("Product Manager\nSQL");
    expect(deps.extractDocxText).toHaveBeenCalledOnce();
    expect(JSON.stringify(deps)).not.toContain("ocr");
    expect(JSON.stringify(deps)).not.toContain("aiProvider");
  });

  it("rejects an unexpected stored content type", async () => {
    const deps = fakes();
    deps.getOwnedAsset.mockResolvedValue(asset("text/html", "resume.html"));
    const get = createSourceAssetPreviewHandler(deps);

    const response = await get(request(), { params: Promise.resolve({ id: assetId }) });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "source-preview-unsupported",
    });
    expect(deps.downloadSource).not.toHaveBeenCalled();
  });
});
