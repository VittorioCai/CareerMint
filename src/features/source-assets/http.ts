import type { CreateAssetInput, SourceAsset } from "./repository";
import {
  isResumeValidationError,
  MAX_FILE_SIZE,
  type ValidatedResumeFile,
} from "./schemas";

/**
 * The file, plus what multipart wraps around it: a boundary line either side
 * and a few headers. That is a few hundred bytes; this leaves room and is
 * still nowhere near a second megabyte.
 */
const MAX_UPLOAD_REQUEST_BYTES = MAX_FILE_SIZE + 64 * 1024;

class UploadTooLargeError extends Error {}

/**
 * The form, read without ever holding more than the limit.
 *
 * `request.formData()` buffers the whole body before there is a file to
 * measure, so the size check that follows it ran after the memory had been
 * spent: a signed-in client could send any number of bytes and have them all
 * read. The declared length is refused up front, and because a length can be
 * left out or understated, the body is also counted as it arrives and cut off
 * at the same limit.
 */
async function readFormData(request: Request) {
  const declared = request.headers.get("content-length");
  if (
    declared &&
    /^\d+$/u.test(declared.trim()) &&
    Number(declared) > MAX_UPLOAD_REQUEST_BYTES
  ) {
    throw new UploadTooLargeError();
  }
  if (!request.body) return request.formData();

  let received = 0;
  let exceeded = false;
  const counted = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > MAX_UPLOAD_REQUEST_BYTES) {
          exceeded = true;
          controller.error(new UploadTooLargeError());
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  try {
    return await new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: counted,
      // Required for a streamed body, and not yet in the DOM typings.
      duplex: "half",
    } as RequestInit).formData();
  } catch (error) {
    // The parser reports a cut-off stream in its own words.
    if (exceeded) throw new UploadTooLargeError();
    throw error;
  }
}

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

    let formData: FormData;
    try {
      formData = await readFormData(request);
    } catch (error) {
      if (error instanceof UploadTooLargeError) {
        return Response.json({ error: "file-too-large" }, { status: 413 });
      }
      return Response.json({ error: "missing-file" }, { status: 400 });
    }
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
