// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { AccountDeletionError, deleteOwnedAccount } from "./delete-account";

const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };

function createFakes() {
  const order: string[] = [];
  return {
    dependencies: {
      listAssets: vi.fn().mockResolvedValue([
        {
          userId: user.id,
          storagePath: `${user.id}/asset-a/source.pdf`,
        },
      ]),
      removeSources: vi.fn().mockImplementation(async () => {
        order.push("storage");
      }),
      deleteAuthUser: vi.fn().mockImplementation(async () => {
        order.push("auth");
      }),
    },
    order,
  };
}

describe("deleteOwnedAccount", () => {
  it("removes owned files before deleting the verified auth user", async () => {
    const { dependencies, order } = createFakes();

    await deleteOwnedAccount(user, dependencies);

    expect(dependencies.listAssets).toHaveBeenCalledWith(user.id);
    expect(dependencies.removeSources).toHaveBeenCalledWith([
      `${user.id}/asset-a/source.pdf`,
    ]);
    expect(dependencies.deleteAuthUser).toHaveBeenCalledWith(user.id);
    expect(order).toEqual(["storage", "auth"]);
  });

  it("leaves the auth account intact when storage deletion fails", async () => {
    const { dependencies } = createFakes();
    dependencies.removeSources.mockRejectedValue(new Error("provider details"));

    await expect(deleteOwnedAccount(user, dependencies)).rejects.toEqual(
      new AccountDeletionError("storage-delete-incomplete"),
    );
    expect(dependencies.deleteAuthUser).not.toHaveBeenCalled();
  });
});
