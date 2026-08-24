import { extractDocxText } from "@/features/source-assets/parsers/docx";
import { createSourceAssetPreviewHandler } from "@/features/source-assets/preview-http";
import { getOwnedAsset } from "@/features/source-assets/repository";
import { downloadSource } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";

export const GET = createSourceAssetPreviewHandler({
  requireUser: getCurrentUser,
  getOwnedAsset,
  downloadSource,
  extractDocxText,
});
