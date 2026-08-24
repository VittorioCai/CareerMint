// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getOwnedAsset: vi.fn(),
  downloadSource: vi.fn(),
  extractDocxText: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/features/source-assets/repository", () => ({
  getOwnedAsset: mocks.getOwnedAsset,
}));
vi.mock("@/features/source-assets/storage", () => ({
  downloadSource: mocks.downloadSource,
}));
vi.mock("@/features/source-assets/parsers/docx", () => ({
  extractDocxText: mocks.extractDocxText,
}));

import { GET, runtime } from "./route";

describe("GET /api/source-assets/[id]/preview wiring", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the Node runtime and owner-scoped dependencies", async () => {
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const assetId = "11111111-1111-4111-8111-111111111111";
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
    mocks.downloadSource.mockResolvedValue(new Blob(["%PDF"]));

    const response = await GET(
      new Request(`http://localhost/api/source-assets/${assetId}/preview`),
      { params: Promise.resolve({ id: assetId }) },
    );

    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(mocks.getOwnedAsset).toHaveBeenCalledWith(userId, assetId);
    expect(mocks.downloadSource).toHaveBeenCalledWith(
      `${userId}/${assetId}/source.pdf`,
    );
  });
});
