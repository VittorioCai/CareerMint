import { randomUUID } from "node:crypto";

import { createSourceAssetPostHandler } from "@/features/source-assets/http";
import {
  createAsset,
  findCanonicalAssetByHash,
} from "@/features/source-assets/repository";
import { validateResumeFile } from "@/features/source-assets/schemas";
import { removeSources, uploadSource } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";

export const POST = createSourceAssetPostHandler({
  requireUser: getCurrentUser,
  validateResumeFile,
  findCanonicalAssetByHash,
  allocateId: randomUUID,
  uploadSource,
  createAsset,
  removeSources,
});
