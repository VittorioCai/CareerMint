import { createHash } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const sourceAssetIdSchema = z.uuid();

export const resumeContentTypeSchema = z.enum([PDF_MIME, DOCX_MIME]);
export type ResumeContentType = z.infer<typeof resumeContentTypeSchema>;

const extensionByContentType: Record<ResumeContentType, "pdf" | "docx"> = {
  [PDF_MIME]: "pdf",
  [DOCX_MIME]: "docx",
};

const validationErrors = new Set([
  "empty-file",
  "file-too-large",
  "unsupported-content-type",
  "unsupported-file-signature",
  "content-type-mismatch",
]);

export function isResumeValidationError(error: unknown): error is Error {
  return error instanceof Error && validationErrors.has(error.message);
}

function sanitizeFilename(name: string, extension: "pdf" | "docx") {
  const finalSegment = name.split(/[/\\]/).at(-1) ?? "";
  const sanitized = finalSegment
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);

  return sanitized || `resume.${extension}`;
}

export type ValidatedResumeFile = {
  buffer: Buffer;
  originalName: string;
  contentType: ResumeContentType;
  extension: "pdf" | "docx";
  sizeBytes: number;
  sha256: string;
};

export async function validateResumeFile(
  file: File,
): Promise<ValidatedResumeFile> {
  if (file.size === 0) throw new Error("empty-file");
  if (file.size > MAX_FILE_SIZE) throw new Error("file-too-large");

  const declaredType = resumeContentTypeSchema.safeParse(file.type);
  if (!declaredType.success) throw new Error("unsupported-content-type");

  const buffer = Buffer.from(await file.arrayBuffer());
  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(buffer);
  } catch {
    throw new Error("unsupported-file-signature");
  }

  const detectedType = resumeContentTypeSchema.safeParse(detected?.mime);
  if (!detectedType.success) throw new Error("unsupported-file-signature");
  if (detectedType.data !== declaredType.data) {
    throw new Error("content-type-mismatch");
  }

  const extension = extensionByContentType[declaredType.data];
  return {
    buffer,
    originalName: sanitizeFilename(file.name, extension),
    contentType: declaredType.data,
    extension,
    sizeBytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
