import type { CreateAssetInput, SourceAsset } from "./repository";
import {
  isResumeValidationError,
  type ValidatedResumeFile,
} from "./schemas";

type UploadSourceInput = Pick<
  ValidatedResumeFile,
  "buffer" | "contentType" | "extension"
> & {
  userId: string;
  assetId: string;
};

export type SourceAssetPostDependencies = {
  requireUser(): Promise<{ id: string } | null>;
  validateResumeFile(file: File): Promise<ValidatedResumeFile>;
  findCanonicalAssetByHash(
    userId: string,
    sha256: string,
  ): Promise<Pick<SourceAsset, "id" | "originalName"> | null>;
  allocateId(): string;
  uploadSource(input: UploadSourceInput): Promise<string>;
  createAsset(input: CreateAssetInput): Promise<unknown>;
  removeSources(storagePaths: string[]): Promise<void>;
};

function isCanonicalConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "source-asset-conflict"
  );
}

export function createSourceAssetPostHandler(
  dependencies: SourceAssetPostDependencies,
) {
  return async function post(request: Request) {
    const user = await dependencies.requireUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "missing-file" }, { status: 400 });
    }

    let validated: ValidatedResumeFile;
    try {
      validated = await dependencies.validateResumeFile(file);
    } catch (error) {
      if (isResumeValidationError(error)) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      return Response.json({ error: "invalid-file" }, { status: 400 });
    }

    try {
      const canonical = await dependencies.findCanonicalAssetByHash(
        user.id,
        validated.sha256,
      );
      if (canonical) {
        return Response.json({
          id: canonical.id,
          originalName: canonical.originalName,
          reused: true,
        });
      }
    } catch {
      return Response.json({ error: "upload-failed" }, { status: 500 });
    }

    const assetId = dependencies.allocateId();
    let storagePath: string;
    try {
      storagePath = await dependencies.uploadSource({
        userId: user.id,
        assetId,
        extension: validated.extension,
        buffer: validated.buffer,
        contentType: validated.contentType,
      });
    } catch {
      return Response.json({ error: "upload-failed" }, { status: 500 });
    }

    try {
      await dependencies.createAsset({
        id: assetId,
        userId: user.id,
        originalName: validated.originalName,
        contentType: validated.contentType,
        storagePath,
        sizeBytes: validated.sizeBytes,
        sha256: validated.sha256,
      });
    } catch (error) {
      try {
        await dependencies.removeSources([storagePath]);
      } catch {
        // The response remains sanitized; cleanup can be retried operationally.
      }

      if (isCanonicalConflict(error)) {
        try {
          const canonical = await dependencies.findCanonicalAssetByHash(
            user.id,
            validated.sha256,
          );
          if (canonical) {
            return Response.json({
              id: canonical.id,
              originalName: canonical.originalName,
              reused: true,
            });
          }
        } catch {
          // The response remains sanitized if the winning row cannot be read.
        }
      }
      return Response.json({ error: "upload-failed" }, { status: 500 });
    }

    return Response.json(
      { id: assetId, originalName: validated.originalName, reused: false },
      { status: 201 },
    );
  };
}
