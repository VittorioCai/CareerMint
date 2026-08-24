import { createHash } from "node:crypto";

import { z } from "zod";

import type { Application } from "@/features/applications/schemas";
import type { AIProvider } from "@/features/extraction/provider";
import type { JDAnalysisRun } from "@/features/jd-analysis/schemas";
import type { SourceAsset } from "@/features/source-assets/repository";

import type { ResumeGapProviderRequirement, ResumeGapRun } from "./schemas";
import type { ResumeGapServiceRequirement, ResumeGapServiceResult } from "./service";

export const resumeGapSchemaVersion = "resume-gap-v1";
export const resumeGapAnalysisSchemaVersion = resumeGapSchemaVersion;
const applicationIdSchema = z.uuid();
const MAX_OCR_REQUEST_BYTES = 1_048_576;

type ResumeGapApplication = Pick<Application, "id" | "userId"> & {
  resumeSourceAssetId: string | null;
};

export type ResumeGapPostDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getApplication(userId: string, applicationId: string): Promise<ResumeGapApplication | null>;
  getAIProcessingConsentAt(userId: string): Promise<string | null>;
  getLatestSucceededAnalysis(userId: string, applicationId: string): Promise<Pick<JDAnalysisRun, "id" | "applicationId" | "userId" | "status"> | null>;
  listRequirements(userId: string, applicationId: string, analysisRunId: string): Promise<ResumeGapServiceRequirement[]>;
  getOwnedAsset(userId: string, assetId: string): Promise<SourceAsset | null>;
  createOrGetRun(input: {
    applicationId: string;
    analysisRunId: string;
    sourceAssetId: string;
    inputHash: string;
    provider: string;
    model: string;
  }): Promise<ResumeGapRun>;
  providerConfig: { provider: string; model: string };
  providerFactory(): Pick<AIProvider, "analyzeResumeGaps">;
  runAnalysis(input: {
    userId: string;
    run: ResumeGapRun;
    asset: SourceAsset;
    analysisRun: Pick<JDAnalysisRun, "id" | "applicationId" | "userId" | "status">;
    requirements: ResumeGapServiceRequirement[];
    ocrText?: string;
    providerFactory: () => Pick<AIProvider, "analyzeResumeGaps">;
  }): Promise<ResumeGapServiceResult>;
};

class InvalidBodyError extends Error {}
class BodyTooLargeError extends Error {}

function rejectDeclaredOversizedRequest(request: Request) {
  const value = request.headers.get("content-length");
  if (value && /^\d+$/.test(value.trim()) && Number(value) > MAX_OCR_REQUEST_BYTES) {
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
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new InvalidBodyError();
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new InvalidBodyError(); }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(parsed, "ocrText") ||
    typeof (parsed as { ocrText?: unknown }).ocrText !== "string"
  ) throw new InvalidBodyError();
  return (parsed as { ocrText: string }).ocrText;
}

export function buildResumeGapInputHash(input: {
  provider: string;
  model: string;
  analysisRunId: string;
  sourceSha256: string;
  requirements: ResumeGapProviderRequirement[];
  schemaVersion?: string;
}) {
  const requirements = [...input.requirements]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, category, text, priority }) => ({ id, category, text, priority }));
  return createHash("sha256")
    .update(JSON.stringify({
      schemaVersion: input.schemaVersion ?? resumeGapSchemaVersion,
      provider: input.provider,
      model: input.model,
      analysisRunId: input.analysisRunId,
      sourceSha256: input.sourceSha256,
      requirements,
    }))
    .digest("hex");
}

// Keep the longer name available to callers that use the domain terminology.
export const buildResumeGapAnalysisInputHash = buildResumeGapInputHash;

function responseForRun(result: ResumeGapServiceResult) {
  return {
    runId: result.run.id,
    status: result.run.status,
    reused: result.reused,
    errorCode: result.run.errorCode,
  };
}

export function createResumeGapPostHandler(dependencies: ResumeGapPostDependencies) {
  return async function post(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await dependencies.getCurrentUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const parsedId = applicationIdSchema.safeParse(id);
    if (!parsedId.success) return Response.json({ error: "application-not-found" }, { status: 404 });
    try {
      rejectDeclaredOversizedRequest(request);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return Response.json({ error: "ocr-request-too-large" }, { status: 413 });
      }
      return Response.json({ error: "resume-gap-request-failed" }, { status: 500 });
    }

    try {
      const application = await dependencies.getApplication(user.id, parsedId.data);
      if (!application) return Response.json({ error: "application-not-found" }, { status: 404 });
      const consentAt = await dependencies.getAIProcessingConsentAt(user.id);
      if (!consentAt) return Response.json({ error: "ai-processing-consent-required" }, { status: 403 });
      const analysisRun = await dependencies.getLatestSucceededAnalysis(user.id, application.id);
      if (
        !analysisRun ||
        analysisRun.status !== "succeeded" ||
        analysisRun.userId !== user.id ||
        analysisRun.applicationId !== application.id
      ) return Response.json({ error: "jd-analysis-required" }, { status: 409 });
      const requirements = await dependencies.listRequirements(user.id, application.id, analysisRun.id);
      if (requirements.length === 0) return Response.json({ error: "jd-analysis-required" }, { status: 409 });
      if (!application.resumeSourceAssetId) return Response.json({ error: "resume-source-required" }, { status: 409 });
      const declaredAssetId = request.headers.get("x-resume-source-asset-id");
      if (!declaredAssetId || !applicationIdSchema.safeParse(declaredAssetId).success || declaredAssetId !== application.resumeSourceAssetId) {
        return Response.json({ error: "resume-source-changed" }, { status: 409 });
      }
      const asset = await dependencies.getOwnedAsset(user.id, application.resumeSourceAssetId);
      if (!asset) return Response.json({ error: "resume-source-required" }, { status: 409 });

      let ocrText: string | undefined;
      try {
        ocrText = await readOCRText(request);
      } catch (error) {
        if (error instanceof BodyTooLargeError) return Response.json({ error: "ocr-request-too-large" }, { status: 413 });
        if (error instanceof InvalidBodyError) return Response.json({ error: "invalid-ocr-text" }, { status: 400 });
        return Response.json({ error: "resume-gap-request-failed" }, { status: 500 });
      }

      const inputHash = buildResumeGapInputHash({
        ...dependencies.providerConfig,
        analysisRunId: analysisRun.id,
        sourceSha256: asset.sha256,
        requirements,
      });
      const run = await dependencies.createOrGetRun({
        applicationId: application.id,
        analysisRunId: analysisRun.id,
        sourceAssetId: asset.id,
        inputHash,
        ...dependencies.providerConfig,
      });
      if (run.status === "succeeded") {
        return Response.json({ runId: run.id, status: run.status, reused: true, errorCode: run.errorCode });
      }
      const result = await dependencies.runAnalysis({
        userId: user.id,
        run,
        asset,
        analysisRun,
        requirements,
        ...(ocrText === undefined ? {} : { ocrText }),
        providerFactory: dependencies.providerFactory,
      });
      return Response.json(responseForRun(result));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "ai-processing-consent-required") return Response.json({ error: code }, { status: 403 });
      return Response.json({ error: "resume-gap-request-failed" }, { status: 500 });
    }
  };
}
