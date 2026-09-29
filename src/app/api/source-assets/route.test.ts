// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSourceAssetPostHandler } from "@/features/source-assets/http";

const assetId = "11111111-1111-4111-8111-111111111111";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function uploadRequest() {
  const body = new FormData();
  body.set(
    "file",
    new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "resume.pdf", {
      type: "application/pdf",
    }),
  );
  return new Request("http://localhost/api/source-assets", {
    method: "POST",
    body,
  });
}

function createFakes() {
  return {
    requireUser: vi
      .fn<() => Promise<{ id: string } | null>>()
      .mockResolvedValue({ id: userId }),
    validateResumeFile: vi.fn().mockResolvedValue({
      buffer: Buffer.from("%PDF"),
      originalName: "resume.pdf",
      contentType: "application/pdf" as const,
      extension: "pdf" as const,
      sizeBytes: 4,
      sha256: "a".repeat(64),
    }),
    allocateId: vi.fn().mockReturnValue(assetId),
    findCanonicalAssetByHash: vi.fn().mockResolvedValue(null),
    uploadSource: vi
      .fn()
      .mockResolvedValue(`${userId}/${assetId}/source.pdf`),
    createAsset: vi.fn().mockResolvedValue({
      id: assetId,
      originalName: "resume.pdf",
    }),
    removeSources: vi.fn().mockResolvedValue(undefined),
  };
}

describe("POST /api/source-assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for an unauthenticated upload", async () => {
    const fakes = createFakes();
    fakes.requireUser.mockResolvedValue(null);
    const post = createSourceAssetPostHandler(fakes);

    const response = await post(uploadRequest());

    expect(response.status).toBe(401);
    expect(fakes.validateResumeFile).not.toHaveBeenCalled();
  });

  it("returns a stable 400 response for invalid file content", async () => {
    const fakes = createFakes();
    fakes.validateResumeFile.mockRejectedValue(
      new Error("unsupported-file-signature"),
    );
    const post = createSourceAssetPostHandler(fakes);

    const response = await post(uploadRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported-file-signature",
    });
    expect(fakes.uploadSource).not.toHaveBeenCalled();
  });

  it("refuses a body that declares more than a resume can be, before reading it", async () => {
    const fakes = createFakes();
    const post = createSourceAssetPostHandler(fakes);
    const body = vi.fn();

    const response = await post(
      new Request("http://localhost/api/source-assets", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=x",
          "content-length": String(11 * 1024 * 1024),
        },
        // A high-water mark of zero, so the stream asks for nothing until
        // something reads from it.
        body: new ReadableStream({ pull: body }, { highWaterMark: 0 }),
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "file-too-large" });
    // Not one byte: the point is that the memory is never spent.
    expect(body).not.toHaveBeenCalled();
    expect(fakes.validateResumeFile).not.toHaveBeenCalled();
  });

  it("cuts off a body that grows past the limit without having declared it", async () => {
    const fakes = createFakes();
    const post = createSourceAssetPostHandler(fakes);
    const megabyte = new Uint8Array(1024 * 1024);
    let sent = 0;

    const response = await post(
      new Request("http://localhost/api/source-assets", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=x" },
        body: new ReadableStream({
          pull(controller) {
            sent += 1;
            // Forty megabytes on offer. A length can be left out, so the
            // header is not the only thing that has to be believed.
            if (sent > 40) controller.close();
            else controller.enqueue(megabyte);
          },
        }),
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
    expect(sent).toBeLessThan(15);
    expect(fakes.validateResumeFile).not.toHaveBeenCalled();
  });

  it("answers a body that is not a form without throwing", async () => {
    const fakes = createFakes();
    const post = createSourceAssetPostHandler(fakes);

    const response = await post(
      new Request("http://localhost/api/source-assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "missing-file" });
  });

  it("stores one user-prefixed source without exposing its path", async () => {
    const fakes = createFakes();
    const post = createSourceAssetPostHandler(fakes);

    const response = await post(uploadRequest());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(fakes.uploadSource).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        assetId,
        extension: "pdf",
      }),
    );
    expect(fakes.createAsset).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({
      id: assetId,
      originalName: "resume.pdf",
      reused: false,
    });
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain(userId);
  });

  it("reuses the owned canonical asset before uploading identical bytes", async () => {
    const fakes = createFakes();
    fakes.findCanonicalAssetByHash.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      originalName: "canonical.pdf",
    });
    const post = createSourceAssetPostHandler(fakes);

    const response = await post(uploadRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "22222222-2222-4222-8222-222222222222",
      originalName: "canonical.pdf",
      reused: true,
    });
    expect(fakes.findCanonicalAssetByHash).toHaveBeenCalledWith(
      userId,
      "a".repeat(64),
    );
    expect(fakes.allocateId).not.toHaveBeenCalled();
    expect(fakes.uploadSource).not.toHaveBeenCalled();
    expect(fakes.createAsset).not.toHaveBeenCalled();
  });

  it("cleans up a racing upload and returns the canonical winner", async () => {
    const fakes = createFakes();
    fakes.findCanonicalAssetByHash
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "33333333-3333-4333-8333-333333333333",
        originalName: "winner.pdf",
      });
    fakes.createAsset.mockRejectedValue(
      Object.assign(new Error("source-asset-conflict"), {
        code: "source-asset-conflict",
      }),
    );
    const post = createSourceAssetPostHandler(fakes);

    const response = await post(uploadRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "33333333-3333-4333-8333-333333333333",
      originalName: "winner.pdf",
      reused: true,
    });
    expect(fakes.removeSources).toHaveBeenCalledWith([
      `${userId}/${assetId}/source.pdf`,
    ]);
    expect(fakes.findCanonicalAssetByHash).toHaveBeenCalledTimes(2);
  });
});
