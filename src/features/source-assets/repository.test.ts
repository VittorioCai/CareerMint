// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  findCanonicalAssetByHash,
  SourceAssetRepositoryError,
  listAssets,
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
