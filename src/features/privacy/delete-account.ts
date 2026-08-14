type VerifiedUser = { id: string };

export type AccountDeletionDependencies = {
  listAssets(userId: string): Promise<Array<{ userId: string; storagePath: string }>>;
  removeSources(storagePaths: string[]): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
};

export class AccountDeletionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AccountDeletionError";
  }
}

export async function deleteOwnedAccount(
  user: VerifiedUser,
  dependencies: AccountDeletionDependencies,
): Promise<void> {
  const assets = await dependencies.listAssets(user.id);
  const ownedPaths = assets
    .filter((asset) => asset.userId === user.id)
    .map((asset) => asset.storagePath);

  try {
    await dependencies.removeSources(ownedPaths);
  } catch {
    throw new AccountDeletionError("storage-delete-incomplete");
  }

  try {
    await dependencies.deleteAuthUser(user.id);
  } catch {
    throw new AccountDeletionError("auth-account-delete-failed");
  }
}
