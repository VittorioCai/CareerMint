import { SourceAssetRepositoryError, type SourceAsset } from "./repository";
import { sourceAssetIdSchema } from "./schemas";

type DeleteContext = { params: Promise<{ id: string }> };

export type SourceAssetDeleteDependencies = {
  requireUser(): Promise<{ id: string } | null>;
  getOwnedAsset(userId: string, assetId: string): Promise<SourceAsset | null>;
  listDuplicateStoragePaths(userId: string, assetId: string): Promise<string[]>;
  removeSources(storagePaths: string[]): Promise<void>;
  deleteAsset(assetId: string): Promise<void>;
};

export function createSourceAssetDeleteHandler(
  dependencies: SourceAssetDeleteDependencies,
) {
  return async function del(_request: Request, context: DeleteContext) {
    const user = await dependencies.requireUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const parsedId = sourceAssetIdSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json({ error: "source-asset-not-found" }, { status: 404 });
    }

    try {
      const asset = await dependencies.getOwnedAsset(user.id, parsedId.data);
      if (!asset) {
        return Response.json(
          { error: "source-asset-not-found" },
          { status: 404 },
        );
      }

      // An asset mid-extraction is deleted anyway. Nothing recovers
      // `source_assets.status` if the invocation that set it dies, so refusing
      // here would leave the file permanently undeletable — strictly worse
      // than the extraction failing, which the user can simply retry.
      const duplicatePaths = await dependencies.listDuplicateStoragePaths(
        user.id,
        parsedId.data,
      );

      // Storage first. A failure here leaves a row the user can retry against;
      // the other order would leave an invisible orphan file nothing can find.
      await dependencies.removeSources([asset.storagePath, ...duplicatePaths]);
      await dependencies.deleteAsset(parsedId.data);

      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof SourceAssetRepositoryError) {
        if (error.code === "source-asset-not-found") {
          return Response.json({ error: error.code }, { status: 404 });
        }
        if (error.code === "source-asset-in-use") {
          return Response.json({ error: error.code }, { status: 409 });
        }
      }
      return Response.json({ error: "source-delete-failed" }, { status: 500 });
    }
  };
}
