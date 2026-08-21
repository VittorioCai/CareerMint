import type { AIProvider } from "./provider";
import type {
  ResumeExtractionAsset,
} from "./service";
import type {
  ProcessingJob,
} from "@/features/jobs/repository";
import { sourceAssetIdSchema } from "@/features/source-assets/schemas";
import { normalizeResumeText } from "@/features/source-assets/parsers";

const MAX_OCR_REQUEST_BYTES = 1_048_576;

export type SourceAssetExtractPostDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getOwnedAsset(
    userId: string,
    assetId: string,
  ): Promise<ResumeExtractionAsset | null>;
  getAIProcessingConsentAt(userId: string): Promise<string | null>;
  createOrGetJob(
    assetId: string,
    idempotencyKey: string,
  ): Promise<ProcessingJob>;
  providerFactory(): Pick<AIProvider, "extractResumeFacts">;
  runExtraction(input: {
    userId: string;
    job: ProcessingJob;
    asset: ResumeExtractionAsset;
    provider: Pick<AIProvider, "extractResumeFacts">;
    sourceText?: string;
  }): Promise<ProcessingJob>;
};

class InvalidOCRTextError extends Error {
  constructor() {
    super("invalid-ocr-text");
    this.name = "InvalidOCRTextError";
  }
}

class OCRRequestTooLargeError extends Error {
  constructor() {
    super("ocr-request-too-large");
    this.name = "OCRRequestTooLargeError";
  }
}

function rejectDeclaredOversizedRequest(request: Request) {
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength === null) return;

  const contentLength = rawContentLength.trim();
  if (!/^\d+$/.test(contentLength)) return;

  const declaredBytes = Number(contentLength);
  if (declaredBytes > MAX_OCR_REQUEST_BYTES) {
    throw new OCRRequestTooLargeError();
  }
}

async function readRequestBody(request: Request) {
  rejectDeclaredOversizedRequest(request);
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      body += decoder.decode();
      return body;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_OCR_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new OCRRequestTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
}

async function readOptionalOCRText(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") return undefined;

  const body = await readRequestBody(request);
  if (!body.trim()) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new InvalidOCRTextError();
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    !Object.prototype.hasOwnProperty.call(parsed, "ocrText")
  ) {
    return undefined;
  }

  const ocrText = (parsed as { ocrText?: unknown }).ocrText;
  if (typeof ocrText !== "string") throw new InvalidOCRTextError();

  try {
    return normalizeResumeText(ocrText);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "resume-text-too-short" ||
        error.message === "resume-text-too-long")
    ) {
      throw new InvalidOCRTextError();
    }
    throw error;
  }
}

export function createSourceAssetExtractPostHandler(
  dependencies: SourceAssetExtractPostDependencies,
) {
  return async function post(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const user = await dependencies.getCurrentUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const parsedId = sourceAssetIdSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json(
        { error: "source-asset-not-found" },
        { status: 404 },
      );
    }

    try {
      const asset = await dependencies.getOwnedAsset(user.id, parsedId.data);
      if (!asset) {
        return Response.json(
          { error: "source-asset-not-found" },
          { status: 404 },
        );
      }

      const consentAt = await dependencies.getAIProcessingConsentAt(user.id);
      if (!consentAt) {
        return Response.json(
          { error: "ai-processing-consent-required" },
          { status: 403 },
        );
      }

      let sourceText: string | undefined;
      try {
        sourceText = await readOptionalOCRText(request);
      } catch (error) {
        if (error instanceof InvalidOCRTextError) {
          return Response.json({ error: "invalid-ocr-text" }, { status: 400 });
        }
        if (error instanceof OCRRequestTooLargeError) {
          return Response.json(
            { error: "ocr-request-too-large" },
            { status: 413 },
          );
        }
        throw error;
      }

      const idempotencyKey = sourceText
        ? `source-asset:${asset.id}:resume-extract:ocr:v1`
        : `source-asset:${asset.id}:resume-extract:v1`;
      const job = await dependencies.createOrGetJob(
        asset.id,
        idempotencyKey,
      );
      if (job.status === "running" || job.status === "succeeded") {
        return Response.json({ jobId: job.id, status: job.status });
      }

      const completed = await dependencies.runExtraction({
        userId: user.id,
        job,
        asset,
        provider: dependencies.providerFactory(),
        ...(sourceText === undefined ? {} : { sourceText }),
      });
      return Response.json({
        jobId: completed.id,
        status: completed.status,
        ...(completed.status === "failed" && completed.errorCode
          ? { errorCode: completed.errorCode }
          : {}),
      });
    } catch {
      return Response.json(
        { error: "resume-extraction-request-failed" },
        { status: 500 },
      );
    }
  };
}
