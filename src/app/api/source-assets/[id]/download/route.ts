import { NextResponse } from "next/server";

import { getOwnedAsset } from "@/features/source-assets/repository";
import { sourceAssetIdSchema } from "@/features/source-assets/schemas";
import { createSourceDownloadUrl } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const parsedId = sourceAssetIdSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "source-asset-not-found" }, { status: 404 });
  }

  try {
    const asset = await getOwnedAsset(user.id, parsedId.data);
    if (!asset) {
      return Response.json(
        { error: "source-asset-not-found" },
        { status: 404 },
      );
    }

    const signedUrl = await createSourceDownloadUrl(asset.storagePath);
    return NextResponse.redirect(signedUrl, 302);
  } catch {
    return Response.json({ error: "download-failed" }, { status: 500 });
  }
}
