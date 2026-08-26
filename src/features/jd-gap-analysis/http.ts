import { z } from "zod";

import type { Application } from "@/features/applications/schemas";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import type { SourceAsset } from "@/features/source-assets/repository";

import type { JDGapComparisonServiceResult } from "./comparison-service";
import type { JDGapV3Run } from "./gap-repository";
import {
  JD_GAP_SCHEMA_VERSION,
  JD_STRUCTURE_SCHEMA_VERSION,
  buildConfirmedFactFingerprint,
  buildJDGapInputHash,
  buildJDStructureInputHash,
  hashTextSha256,
} from "./hashes";
import type { ComparisonPromptVariant } from "./prompts";
import type { JDStructureServiceResult } from "./structure-service";
import {
  asJDGapRequirements,
  type JDStructureRequirementRecord,
  type JDStructureRun,
} from "./structure-repository";

const applicationIdSchema = z.uuid();
const MAX_OCR_REQUEST_BYTES = 1_048_576;

type GapApplication = Pick<
  Application,
  "id" | "userId" | "jdText" | "resumeSourceAssetId"
>;

export type JDGapAdvanceResponse = {
  status: "queued" | "running" | "succeeded" | "failed";
  phase: "structure" | "comparison" | "complete";
  nextPhase: "comparison" | null;
  structureRunId: string | null;
  gapRunId: string | null;
  reused: boolean;
  errorCode: string | null;
};

export type JDGapAdvanceDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getApplication(userId: string, applicationId: string): Promise<GapApplication | null>;
  getAIProcessingConsentAt(userId: string): Promise<string | null>;
  getOwnedAsset(userId: string, assetId: string): Promise<SourceAsset | null>;
  listConfirmedFacts(userId: string): Promise<ConfirmedFactForAnalysis[]>;
  createOrGetStructureRun(input: {
    applicationId: string;
    jdSha256: string;
    inputHash: string;
    provider: string;
    model: string;
    schemaVersion: string;
    promptVersion: string;
  }): Promise<JDStructureRun>;
  listRequirements(
    userId: string,
    runId: string,
  ): Promise<JDStructureRequirementRecord[]>;
  createOrGetGapRun(input: {
    applicationId: string;
    structureRunId: string;
    sourceAssetId: string;
    factFingerprint: string;
    inputHash: string;
    provider: string;
    model: string;
    schemaVersion: string;
    promptVersion: string;
    policyVersion: string;
  }): Promise<JDGapV3Run>;
  providerConfig: {
    provider: string;
    model: string;
    structurePromptVersion: string;
    comparisonPromptVersion: string;
    comparisonPromptVariant: ComparisonPromptVariant;
    policyVersion: string;
  };
  runStructure(input: {
    userId: string;
    run: JDStructureRun;
    application: { id: string; userId: string; jdText: string };
  }): Promise<JDStructureServiceResult>;
  runComparison(input: {
    userId: string;
    run: JDGapV3Run;
    structureRun: JDStructureRun;
    asset: SourceAsset;
    requirements: ReturnType<typeof asJDGapRequirements>;
    confirmedFacts: ConfirmedFactForAnalysis[];
    ocrText?: string;
  }): Promise<JDGapComparisonServiceResult>;
};

class InvalidBodyError extends Error {}
class BodyTooLargeError extends Error {}

function rejectDeclaredOversizedRequest(request: Request) {
  const value = request.headers.get("content-length");
  if (value && /^\d+$/u.test(value.trim()) && Number(value) > MAX_OCR_REQUEST_BYTES) {
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

function responseForStructure(result: JDStructureServiceResult): JDGapAdvanceResponse {
  const nextPhase = result.run.status === "succeeded" ? "comparison" : null;
  return {
    status: result.run.status,
    phase: "structure",
    nextPhase,
    structureRunId: result.run.id,
    gapRunId: null,
    reused: result.reused,
    errorCode: result.run.errorCode,
  };
}

function responseForGap(
  structureRun: JDStructureRun,
  result: JDGapComparisonServiceResult,
): JDGapAdvanceResponse {
  return {
    status: result.run.status,
    phase: result.run.status === "succeeded" ? "complete" : "comparison",
    nextPhase: null,
    structureRunId: structureRun.id,
    gapRunId: result.run.id,
    reused: result.reused,
    errorCode: result.run.errorCode,
  };
}

function errorResponse(error: unknown) {
  if (error instanceof BodyTooLargeError) {
    return Response.json({ error: "ocr-request-too-large" }, { status: 413 });
  }
  if (error instanceof InvalidBodyError) {
    return Response.json({ error: "invalid-ocr-text" }, { status: 400 });
  }
  return null;
}

export function createJDGapAdvancePostHandler(
  dependencies: JDGapAdvanceDependencies,
) {
  return async function post(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const user = await dependencies.getCurrentUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const parsedId = applicationIdSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json({ error: "application-not-found" }, { status: 404 });
    }
    try {
      rejectDeclaredOversizedRequest(request);
    } catch (error) {
      return errorResponse(error) ?? Response.json({ error: "jd-gap-request-failed" }, { status: 500 });
    }

    try {
      const application = await dependencies.getApplication(user.id, parsedId.data);
      if (!application || application.userId !== user.id) {
        return Response.json({ error: "application-not-found" }, { status: 404 });
      }
      const consentAt = await dependencies.getAIProcessingConsentAt(user.id);
      if (!consentAt) {
        return Response.json({ error: "ai-processing-consent-required" }, { status: 403 });
      }
      if (!application.resumeSourceAssetId) {
        return Response.json({ error: "resume-source-required" }, { status: 409 });
      }
      const declaredAssetId = request.headers.get("x-resume-source-asset-id");
      if (
        !declaredAssetId ||
        !applicationIdSchema.safeParse(declaredAssetId).success ||
        declaredAssetId !== application.resumeSourceAssetId
      ) {
        return Response.json({ error: "resume-source-changed" }, { status: 409 });
      }
      const asset = await dependencies.getOwnedAsset(
        user.id,
        application.resumeSourceAssetId,
      );
      if (!asset || asset.userId !== user.id || asset.status !== "ready") {
        return Response.json({ error: "resume-source-required" }, { status: 409 });
      }

      let ocrText: string | undefined;
      try {
        ocrText = await readOCRText(request);
      } catch (error) {
        return errorResponse(error) ?? Response.json({ error: "jd-gap-request-failed" }, { status: 500 });
      }

      const config = dependencies.providerConfig;
      const jdSha256 = hashTextSha256(application.jdText);
      const structureInputHash = buildJDStructureInputHash({
        jdText: application.jdText,
        provider: config.provider,
        model: config.model,
        schemaVersion: JD_STRUCTURE_SCHEMA_VERSION,
        promptVersion: config.structurePromptVersion,
      });
      const structureRun = await dependencies.createOrGetStructureRun({
        applicationId: application.id,
        jdSha256,
        inputHash: structureInputHash,
        provider: config.provider,
        model: config.model,
        schemaVersion: JD_STRUCTURE_SCHEMA_VERSION,
        promptVersion: config.structurePromptVersion,
      });

      if (structureRun.status !== "succeeded") {
        const result = await dependencies.runStructure({
          userId: user.id,
          run: structureRun,
          application: {
            id: application.id,
            userId: application.userId,
            jdText: application.jdText,
          },
        });
        return Response.json(responseForStructure(result));
      }

      const storedRequirements = await dependencies.listRequirements(
        user.id,
        structureRun.id,
      );
      if (storedRequirements.length === 0) {
        return Response.json({ error: "jd-structure-required" }, { status: 409 });
      }
      const requirements = asJDGapRequirements(storedRequirements);
      const confirmedFacts = await dependencies.listConfirmedFacts(user.id);
      const factFingerprint = buildConfirmedFactFingerprint(confirmedFacts);
      const gapInputHash = buildJDGapInputHash({
        structureRunId: structureRun.id,
        resumeSha256: asset.sha256,
        factFingerprint,
        provider: config.provider,
        model: config.model,
        schemaVersion: JD_GAP_SCHEMA_VERSION,
        promptVersion: config.comparisonPromptVersion,
        policyVersion: config.policyVersion,
      });
      const gapRun = await dependencies.createOrGetGapRun({
        applicationId: application.id,
        structureRunId: structureRun.id,
        sourceAssetId: asset.id,
        factFingerprint,
        inputHash: gapInputHash,
        provider: config.provider,
        model: config.model,
        schemaVersion: JD_GAP_SCHEMA_VERSION,
        promptVersion: config.comparisonPromptVersion,
        policyVersion: config.policyVersion,
      });
      if (gapRun.status === "succeeded") {
        return Response.json(responseForGap(structureRun, { run: gapRun, reused: true }));
      }
      const result = await dependencies.runComparison({
        userId: user.id,
        run: gapRun,
        structureRun,
        asset,
        requirements,
        confirmedFacts,
        ...(ocrText === undefined ? {} : { ocrText }),
      });
      return Response.json(responseForGap(structureRun, result));
    } catch {
      return Response.json({ error: "jd-gap-request-failed" }, { status: 500 });
    }
  };
}
