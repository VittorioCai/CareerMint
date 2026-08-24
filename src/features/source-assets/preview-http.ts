import type { SourceAsset } from "./repository";
import { sourceAssetIdSchema } from "./schemas";

type PreviewContext = { params: Promise<{ id: string }> };

export type SourceAssetPreviewDependencies = {
  requireUser(): Promise<{ id: string } | null>;
  getOwnedAsset(userId: string, assetId: string): Promise<SourceAsset | null>;
  downloadSource(storagePath: string): Promise<Blob>;
  extractDocxText(buffer: Buffer): Promise<string>;
};

const docxContentType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function safeAsciiFilename(originalName: string) {
  const sanitized = originalName
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\/;\r\n]/g, "_")
    .trim();
  return sanitized || "resume";
}

function inlineDisposition(originalName: string) {
  return `inline; filename="${safeAsciiFilename(originalName)}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}

function previewHeaders(originalName: string, contentType: string) {
  return new Headers({
    "Cache-Control": "private, no-store",
    "Content-Disposition": inlineDisposition(originalName),
    "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'self'",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
  });
}

function sanitizePlainText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export function createSourceAssetPreviewHandler(
  dependencies: SourceAssetPreviewDependencies,
) {
  return async function get(_request: Request, context: PreviewContext) {
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

      if (
        asset.contentType !== "application/pdf" &&
        asset.contentType !== docxContentType
      ) {
        return Response.json(
          { error: "source-preview-unsupported" },
          { status: 415 },
        );
      }

      const source = await dependencies.downloadSource(asset.storagePath);
      if (asset.contentType === "application/pdf") {
        return new Response(source, {
          headers: previewHeaders(asset.originalName, "application/pdf"),
        });
      }

      const text = sanitizePlainText(
        await dependencies.extractDocxText(
          Buffer.from(await source.arrayBuffer()),
        ),
      );
      return new Response(text, {
        headers: previewHeaders(
          asset.originalName,
          "text/plain; charset=utf-8",
        ),
      });
    } catch {
      return Response.json({ error: "source-preview-failed" }, { status: 500 });
    }
  };
}
