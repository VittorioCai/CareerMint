import { createSourceAssetDeleteHandler } from "@/features/source-assets/delete-http";
import {
  deleteAsset,
  getOwnedAsset,
  listDuplicateStoragePaths,
} from "@/features/source-assets/repository";
import { removeSources } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";

export const DELETE = createSourceAssetDeleteHandler({
  requireUser: getCurrentUser,
  getOwnedAsset,
  listDuplicateStoragePaths,
  removeSources,
  deleteAsset,
});
