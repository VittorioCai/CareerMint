import { z } from "zod";

import type { Application } from "@/features/applications/schemas";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import type { SourceAsset } from "@/features/source-assets/repository";

import type {
  ResumeJDDifferenceServiceInput,
  ResumeJDDifferenceServiceResult,
} from "./service";

const applicationIdSchema = z.uuid();
const MAX_OCR_REQUEST_BYTES = 1_048_576;

type DifferenceApplication = Pick<
  Application,
  "id" | "userId" | "jdText" | "resumeSourceAssetId"
>;

export type ResumeJDDifferencePostDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getApplication(
    userId: string,
    applicationId: string,
  ): Promise<DifferenceApplication | null>;
  getAIProcessingConsentAt(userId: string): Promise<string | null>;
  getOwnedAsset(userId: string, assetId: string): Promise<SourceAsset | null>;
  listConfirmedFacts(userId: string): Promise<ConfirmedFactForAnalysis[]>;
  runAnalysis(
    input: ResumeJDDifferenceServiceInput,
  ): Promise<ResumeJDDifferenceServiceResult>;
};

class InvalidBodyError extends Error {}
class BodyTooLargeError extends Error {}

function rejectDeclaredOversizedRequest(request: Request) {
  const value = request.headers.get("content-length");
  if (
    value &&
    /^\d+$/u.test(value.trim()) &&
    Number(value) > MAX_OCR_REQUEST_BYTES
  ) {
    throw new BodyTooLargeError();
  }
}

async function readBody(request: Request) {
  rejectDeclaredOversizedRequest(request);
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      body += decoder.decode();
      return body;
    }
    bytes += chunk.value.byteLength;
    if (bytes > MAX_OCR_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
}

async function readOCRText(request: Request) {
  const body = await readBody(request);
  if (!body.trim()) return undefined;
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") throw new InvalidBodyError();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new InvalidBodyError();
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(parsed, "ocrText") ||
    typeof (parsed as { ocrText?: unknown }).ocrText !== "string"
  ) {
    throw new InvalidBodyError();
  }
  return (parsed as { ocrText: string }).ocrText;
}

function mutationResponse(result: ResumeJDDifferenceServiceResult) {
  return {
    runId: result.run.id,
    status: result.run.status,
    reused: result.reused,
    freshness: "current" as const,
    errorCode: result.run.errorCode,
  };
}

export function createResumeJDDifferencePostHandler(
  dependencies: ResumeJDDifferencePostDependencies,
) {
  return async function post(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const user = await dependencies.getCurrentUser();
    if (!user) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const parsedId = applicationIdSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json({ error: "application-not-found" }, { status: 404 });
    }
    try {
      rejectDeclaredOversizedRequest(request);
    } catch {
      return Response.json({ error: "ocr-request-too-large" }, { status: 413 });
    }

    try {
      const application = await dependencies.getApplication(
        user.id,
        parsedId.data,
      );
      if (!application) {
        return Response.json({ error: "application-not-found" }, { status: 404 });
      }

      const consentAt = await dependencies.getAIProcessingConsentAt(user.id);
      if (!consentAt) {
        return Response.json(
          { error: "ai-processing-consent-required" },
          { status: 403 },
        );
      }

      if (!application.resumeSourceAssetId) {
        return Response.json(
          { error: "resume-source-required" },
          { status: 409 },
        );
      }
      const declaredAssetId = request.headers.get(
        "x-resume-source-asset-id",
      );
      if (
        !declaredAssetId ||
        !applicationIdSchema.safeParse(declaredAssetId).success ||
        declaredAssetId !== application.resumeSourceAssetId
      ) {
        return Response.json(
          { error: "resume-source-changed" },
          { status: 409 },
        );
      }

      const asset = await dependencies.getOwnedAsset(
        user.id,
        application.resumeSourceAssetId,
      );
      if (!asset || asset.id !== application.resumeSourceAssetId) {
        return Response.json(
          { error: "resume-source-required" },
          { status: 409 },
        );
      }

      let ocrText: string | undefined;
      try {
        ocrText = await readOCRText(request);
      } catch (error) {
        if (error instanceof BodyTooLargeError) {
          return Response.json(
            { error: "ocr-request-too-large" },
            { status: 413 },
          );
        }
        if (error instanceof InvalidBodyError) {
          return Response.json({ error: "invalid-ocr-text" }, { status: 400 });
        }
        return Response.json(
          { error: "resume-jd-difference-request-failed" },
          { status: 500 },
        );
      }

      const confirmedFacts = await dependencies.listConfirmedFacts(user.id);
      const result = await dependencies.runAnalysis({
        userId: user.id,
        applicationId: application.id,
        jdText: application.jdText,
        asset,
        confirmedFacts,
        ...(ocrText === undefined ? {} : { ocrText }),
      });
      const status =
        result.run.status === "queued" || result.run.status === "running"
          ? 202
          : 200;
      return Response.json(mutationResponse(result), { status });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "application-or-resume-not-found") {
        return Response.json(
          { error: "resume-source-changed" },
          { status: 409 },
        );
      }
      if (code === "job-description-required") {
        return Response.json(
          { error: "job-description-required" },
          { status: 409 },
        );
      }
      return Response.json(
        { error: "resume-jd-difference-request-failed" },
        { status: 500 },
      );
    }
  };
}
