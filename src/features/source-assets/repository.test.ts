// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  deleteAsset,
  findCanonicalAssetByHash,
  SourceAssetRepositoryError,
  listAssets,
  listDuplicateStoragePaths,
  listOwnedStoragePaths,
} from "./repository";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const row = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: userId,
  original_name: "resume.pdf",
  content_type: "application/pdf",
  storage_path: `${userId}/resume.pdf`,
  size_bytes: 100,
  sha256: "a".repeat(64),
  status: "uploaded",
  error_code: null,
  duplicate_of_id: null,
  created_at: "2026-08-24T00:00:00.000Z",
};

function queryFixture(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  const client = { from: vi.fn().mockReturnValue(chain) };
  chain.order.mockImplementationOnce(() => chain).mockImplementationOnce(() => result);
  mocks.createClient.mockResolvedValue(client);
  return { chain, client };
}

function selectFixture(result: { data: unknown; error: unknown }) {
  const chain = { select: vi.fn(), eq: vi.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValueOnce(chain).mockReturnValueOnce(result);
  const client = { from: vi.fn().mockReturnValue(chain) };
  mocks.createClient.mockResolvedValue(client);
  return { chain, client };
}

function rpcFixture(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  mocks.createClient.mockResolvedValue({ rpc });
  return { rpc };
}

describe("source asset listing repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters by owner and sorts newest first with deterministic id tie-break", async () => {
    const { chain, client } = queryFixture({ data: [row], error: null });

    await expect(listAssets(userId)).resolves.toMatchObject([
      {
        id: row.id,
        userId,
        originalName: "resume.pdf",
        duplicateOfId: null,
      },
    ]);
    expect(client.from).toHaveBeenCalledWith("source_assets");
    expect(chain.eq).toHaveBeenCalledExactlyOnceWith("user_id", userId);
    expect(chain.is).toHaveBeenCalledExactlyOnceWith("duplicate_of_id", null);
    expect(chain.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(chain.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
  });

  it("finds an owned canonical asset by exact hash", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle,
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.is.mockReturnValue(chain);
    const client = { from: vi.fn().mockReturnValue(chain) };
    mocks.createClient.mockResolvedValue(client);

    await expect(
      findCanonicalAssetByHash(userId, "a".repeat(64)),
    ).resolves.toMatchObject({ id: row.id, duplicateOfId: null });
    expect(chain.eq).toHaveBeenNthCalledWith(1, "user_id", userId);
    expect(chain.eq).toHaveBeenNthCalledWith(2, "sha256", "a".repeat(64));
    expect(chain.is).toHaveBeenCalledWith("duplicate_of_id", null);
  });

  it("collects the storage paths of an asset's duplicates, owner-scoped", async () => {
    const { chain, client } = selectFixture({
      data: [{ storage_path: "user/dup-a/source.pdf" }, { storage_path: "user/dup-b/source.pdf" }],
      error: null,
    });

    await expect(listDuplicateStoragePaths(userId, row.id)).resolves.toEqual([
      "user/dup-a/source.pdf",
      "user/dup-b/source.pdf",
    ]);
    expect(client.from).toHaveBeenCalledWith("source_assets");
    expect(chain.select).toHaveBeenCalledWith("storage_path");
    expect(chain.eq).toHaveBeenNthCalledWith(1, "user_id", userId);
    expect(chain.eq).toHaveBeenNthCalledWith(2, "duplicate_of_id", row.id);
  });

  it("maps a duplicate lookup failure to the stable repository error", async () => {
    selectFixture({ data: null, error: { code: "XX000" } });

    await expect(listDuplicateStoragePaths(userId, row.id)).rejects.toEqual(
      expect.objectContaining({ code: "source-asset-storage-error" }),
    );
  });

  it("deletes through the RPC so restricting duplicates are cleared first", async () => {
    const { rpc } = rpcFixture({ data: true, error: null });

    await expect(deleteAsset(row.id)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("delete_owned_source_asset", {
      target_asset_id: row.id,
    });
  });

  it("reports a missing or someone else's asset as not-found", async () => {
    rpcFixture({ data: null, error: { code: "P0002" } });

    await expect(deleteAsset(row.id)).rejects.toEqual(
      expect.objectContaining({ code: "source-asset-not-found" }),
    );
  });

  it("keeps a surviving foreign key reference distinguishable from a storage fault", async () => {
    rpcFixture({ data: null, error: { code: "23503" } });

    await expect(deleteAsset(row.id)).rejects.toEqual(
      expect.objectContaining({ code: "source-asset-in-use" }),
    );
  });

  it("maps any other delete failure to the stable storage error", async () => {
    rpcFixture({ data: null, error: { code: "XX000" } });

    await expect(deleteAsset(row.id)).rejects.toEqual(
      expect.objectContaining({ code: "source-asset-storage-error" }),
    );
  });

  it("lists every owned storage path, duplicates included", async () => {
    // listAssets hides duplicates, which is right for a picker and wrong for
    // account deletion: a duplicate's file is just as much the user's data.
    const chain = { select: vi.fn(), eq: vi.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockResolvedValue({
      data: [
        { user_id: userId, storage_path: "user/canonical/source.pdf" },
        { user_id: userId, storage_path: "user/duplicate/source.pdf" },
      ],
      error: null,
    });
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(chain) });

    await expect(listOwnedStoragePaths(userId)).resolves.toEqual([
      { userId, storagePath: "user/canonical/source.pdf" },
      { userId, storagePath: "user/duplicate/source.pdf" },
    ]);
    expect(chain.eq).toHaveBeenCalledExactlyOnceWith("user_id", userId);
    expect(chain.select).toHaveBeenCalledWith("user_id, storage_path");
  });

  it("maps list query errors to the stable repository error", async () => {
    queryFixture({ data: null, error: { code: "XX000" } });

    await expect(listAssets(userId)).rejects.toEqual(
      expect.objectContaining({
        code: "source-asset-storage-error",
        name: SourceAssetRepositoryError.name,
      }),
    );
  });
});
