// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getOwnedAsset: vi.fn(),
  listDuplicateStoragePaths: vi.fn(),
  removeSources: vi.fn(),
  deleteAsset: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/features/source-assets/repository", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/source-assets/repository")
  >("@/features/source-assets/repository");
  return {
    SourceAssetRepositoryError: actual.SourceAssetRepositoryError,
    getOwnedAsset: mocks.getOwnedAsset,
    listDuplicateStoragePaths: mocks.listDuplicateStoragePaths,
    deleteAsset: mocks.deleteAsset,
  };
});
vi.mock("@/features/source-assets/storage", () => ({
  removeSources: mocks.removeSources,
}));

import { DELETE, runtime } from "./route";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assetId = "11111111-1111-4111-8111-111111111111";

describe("DELETE /api/source-assets/[id] wiring", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the Node runtime and owner-scoped dependencies", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: userId });
    mocks.getOwnedAsset.mockResolvedValue({
      id: assetId,
      userId,
      originalName: "resume.pdf",
      contentType: "application/pdf",
      storagePath: `${userId}/${assetId}/source.pdf`,
      sizeBytes: 4,
      sha256: "a".repeat(64),
      duplicateOfId: null,
      status: "ready",
      errorCode: null,
      createdAt: "2026-08-24T00:00:00.000Z",
    });
    mocks.listDuplicateStoragePaths.mockResolvedValue([]);
    mocks.removeSources.mockResolvedValue(undefined);
    mocks.deleteAsset.mockResolvedValue(undefined);

    const response = await DELETE(
      new Request(`https://example.com/api/source-assets/${assetId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: assetId }) },
    );

    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(204);
    expect(mocks.getOwnedAsset).toHaveBeenCalledExactlyOnceWith(userId, assetId);
    expect(mocks.listDuplicateStoragePaths).toHaveBeenCalledExactlyOnceWith(
      userId,
      assetId,
    );
    expect(mocks.deleteAsset).toHaveBeenCalledExactlyOnceWith(assetId);
  });
});
