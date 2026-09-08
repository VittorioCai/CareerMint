// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SourceAssetRepositoryError } from "./repository";
import { createSourceAssetDeleteHandler } from "./delete-http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assetId = "22222222-2222-4222-8222-222222222222";

const asset = {
  id: assetId,
  userId,
  originalName: "resume.pdf",
  contentType: "application/pdf",
  storagePath: `${userId}/${assetId}/source.pdf`,
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  duplicateOfId: null,
  status: "ready" as const,
  errorCode: null,
  createdAt: "2026-09-08T00:00:00.000Z",
};

function createFakes() {
  return {
    requireUser: vi.fn().mockResolvedValue({ id: userId }),
    getOwnedAsset: vi.fn().mockResolvedValue(asset),
    listDuplicateStoragePaths: vi.fn().mockResolvedValue([]),
    removeSources: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
  };
}

function request(id = assetId) {
  return {
    request: new Request(`https://example.com/api/source-assets/${id}`, {
      method: "DELETE",
    }),
    context: { params: Promise.resolve({ id }) },
  };
}

describe("source asset delete handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a signed-out caller before touching anything", async () => {
    const fakes = createFakes();
    fakes.requireUser.mockResolvedValue(null);
    const handler = createSourceAssetDeleteHandler(fakes);
    const { request: req, context } = request();

    const response = await handler(req, context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(fakes.getOwnedAsset).not.toHaveBeenCalled();
  });

  it("treats a malformed id as not found so ids stay unenumerable", async () => {
    const fakes = createFakes();
    const handler = createSourceAssetDeleteHandler(fakes);
    const { request: req, context } = request("not-a-uuid");

    const response = await handler(req, context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "source-asset-not-found",
    });
    expect(fakes.getOwnedAsset).not.toHaveBeenCalled();
  });

  it("does not remove storage for an asset the user does not own", async () => {
    const fakes = createFakes();
    fakes.getOwnedAsset.mockResolvedValue(null);
    const handler = createSourceAssetDeleteHandler(fakes);
    const { request: req, context } = request();

    const response = await handler(req, context);

    expect(response.status).toBe(404);
    expect(fakes.removeSources).not.toHaveBeenCalled();
    expect(fakes.deleteAsset).not.toHaveBeenCalled();
  });

  it("removes the file and every duplicate's file before deleting the row", async () => {
    const fakes = createFakes();
    fakes.listDuplicateStoragePaths.mockResolvedValue([
      `${userId}/33333333-3333-4333-8333-333333333333/source.pdf`,
    ]);
    const handler = createSourceAssetDeleteHandler(fakes);
    const { request: req, context } = request();

    const response = await handler(req, context);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(fakes.removeSources).toHaveBeenCalledExactlyOnceWith([
      asset.storagePath,
      `${userId}/33333333-3333-4333-8333-333333333333/source.pdf`,
    ]);
    expect(fakes.deleteAsset).toHaveBeenCalledExactlyOnceWith(assetId);
    expect(fakes.removeSources.mock.invocationCallOrder[0]).toBeLessThan(
      fakes.deleteAsset.mock.invocationCallOrder[0],
    );
  });

  it("keeps the row when storage removal fails, so the delete can be retried", async () => {
    const fakes = createFakes();
    fakes.removeSources.mockRejectedValue(new Error("source-removal-failed"));
    const handler = createSourceAssetDeleteHandler(fakes);
    const { request: req, context } = request();

    const response = await handler(req, context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "source-delete-failed",
    });
    expect(fakes.deleteAsset).not.toHaveBeenCalled();
  });

  it("reports a row deleted in another tab as not found rather than a fault", async () => {
    const fakes = createFakes();
    fakes.deleteAsset.mockRejectedValue(
      new SourceAssetRepositoryError("source-asset-not-found"),
    );
    const handler = createSourceAssetDeleteHandler(fakes);
    const { request: req, context } = request();

    const response = await handler(req, context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "source-asset-not-found",
    });
  });

  it("surfaces a surviving reference as a conflict", async () => {
    const fakes = createFakes();
    fakes.deleteAsset.mockRejectedValue(
      new SourceAssetRepositoryError("source-asset-in-use"),
    );
    const handler = createSourceAssetDeleteHandler(fakes);
    const { request: req, context } = request();

    const response = await handler(req, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "source-asset-in-use",
    });
  });

  it("maps any other repository failure to a stable server error", async () => {
    const fakes = createFakes();
    fakes.deleteAsset.mockRejectedValue(
      new SourceAssetRepositoryError("source-asset-storage-error"),
    );
    const handler = createSourceAssetDeleteHandler(fakes);
    const { request: req, context } = request();

    const response = await handler(req, context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "source-delete-failed",
    });
  });

  it("deletes an extracting asset rather than trapping the user", async () => {
    // Nothing ever moves an asset out of 'extracting' if the invocation that
    // set it dies, so blocking here would make the file permanently
    // undeletable. The extraction fails instead, which is recoverable.
    const fakes = createFakes();
    fakes.getOwnedAsset.mockResolvedValue({ ...asset, status: "extracting" });
    const handler = createSourceAssetDeleteHandler(fakes);
    const { request: req, context } = request();

    const response = await handler(req, context);

    expect(response.status).toBe(204);
    expect(fakes.deleteAsset).toHaveBeenCalledExactlyOnceWith(assetId);
  });
});
