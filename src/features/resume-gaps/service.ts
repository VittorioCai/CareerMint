import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost } from "@/features/ai/pricing";
import type { AIProvider, AIUsage } from "@/features/extraction/provider";
import { extractResumeText, normalizeResumeText } from "@/features/source-assets/parsers";
import { downloadSource } from "@/features/source-assets/storage";
import type { SourceAsset } from "@/features/source-assets/repository";
import type { JDAnalysisRun } from "@/features/jd-analysis/schemas";

import {
  normalizeStoredIdentifier,
  resumeGapAIResultSchema,
  resumeGapAIUsageSchema,
  resumeGapRunResultSchema,
  sanitizeResumeGapOutput,
  type ResumeGapAnalysisInput,
  type ResumeGapProviderRequirement,
  type ResumeGapRun,
  type ResumeGapRunResult,
  type ResumeGapSafeAIUsage,
} from "./schemas";
import type {
  ResumeGapCompleteInput,
  ResumeGapFailInput,
} from "./repository";

const SAFE_ERROR_MESSAGE = "Resume comparison failed.";
const SAFE_ERROR_CODES = new Set([
  "resume-text-too-short",
  "resume-text-too-long",
  "unsupported-content-type",
  "source-download-failed",
  "resume-gap-invalid-output",
  "ai-provider-rate-limited",
  "ai-provider-request-failed",
  "ai-provider-timeout",
]);

export type ResumeGapServiceDependencies = {
  runs: {
    claim(runId: string, leaseSeconds?: number): Promise<boolean>;
    getOwned(userId: string, runId: string): Promise<ResumeGapRun | null>;
    complete(input: ResumeGapCompleteInput): Promise<ResumeGapRun>;
    fail(input: ResumeGapFailInput): Promise<ResumeGapRun>;
  };
  storage?: { download(storagePath: string): Promise<Blob> };
  parser?: (buffer: Buffer, contentType: string) => Promise<string>;
  providerFactory(): Pick<AIProvider, "analyzeResumeGaps">;
  priceSchedule?: AIPriceSchedule;
  clock?: () => Date;
};

export type ResumeGapServiceInput = {
  userId: string;
  run: ResumeGapRun;
  asset: SourceAsset;
  analysisRun: Pick<JDAnalysisRun, "id" | "applicationId" | "userId" | "status">;
  requirements: ResumeGapProviderRequirement[];
  ocrText?: string;
  providerFactory?: () => Pick<AIProvider, "analyzeResumeGaps">;
};

export type ResumeGapServiceResult = { run: ResumeGapRun; reused: boolean };

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "deepseek-api-key-missing" || code === "ai-provider-authentication-failed") {
    return { errorCode: "resume-gap-unavailable", errorMessage: SAFE_ERROR_MESSAGE };
  }
  return {
    errorCode: SAFE_ERROR_CODES.has(code) ? code : "resume-gap-failed",
    errorMessage: SAFE_ERROR_MESSAGE,
  };
}

async function currentAfterWriteFailure(
  dependencies: ResumeGapServiceDependencies,
  userId: string,
  runId: string,
  expectedAttemptCount: number,
) {
  const current = await dependencies.runs.getOwned(userId, runId);
  if (
    current &&
    ((current.status === "succeeded" || current.status === "failed") ||
      current.attemptCount !== expectedAttemptCount)
  ) {
    return { run: current, reused: true };
  }
  return null;
}

function assertOwnedInputs(input: ResumeGapServiceInput) {
  if (
    input.run.userId !== input.userId ||
    input.run.applicationId !== input.analysisRun.applicationId ||
    input.run.analysisRunId !== input.analysisRun.id ||
    input.analysisRun.userId !== input.userId ||
    input.analysisRun.status !== "succeeded" ||
    input.asset.userId !== input.userId ||
    input.run.sourceAssetId !== input.asset.id ||
    input.run.sourceSha256 !== input.asset.sha256 ||
    input.run.sourceFilename !== input.asset.originalName
  ) {
    throw new Error("application-or-resume-not-found");
  }
  if (input.requirements.length === 0) throw new Error("jd-analysis-required");
  for (const requirement of input.requirements) {
    const candidate = requirement as ResumeGapProviderRequirement & {
      analysisRunId?: string;
      applicationId?: string;
    };
    if (
      candidate.analysisRunId !== undefined && candidate.analysisRunId !== input.analysisRun.id ||
      candidate.applicationId !== undefined && candidate.applicationId !== input.run.applicationId
    ) {
      throw new Error("application-or-resume-not-found");
    }
  }
}

async function readResumeText(
  dependencies: ResumeGapServiceDependencies,
  input: ResumeGapServiceInput,
) {
  if (input.ocrText !== undefined) return normalizeResumeText(input.ocrText);
  const storage = dependencies.storage ?? { download: downloadSource };
  const parser = dependencies.parser ?? extractResumeText;
  let source: Blob;
  try {
    source = await storage.download(input.asset.storagePath);
  } catch (error) {
    if (error instanceof Error && error.message === "source-download-failed") throw error;
    throw new Error("source-download-failed");
  }
  try {
    const extracted = await parser(
      Buffer.from(await source.arrayBuffer()),
      input.asset.contentType,
    );
    return normalizeResumeText(extracted);
  } catch (error) {
    if (error instanceof Error && SAFE_ERROR_CODES.has(error.message)) throw error;
    throw new Error("resume-gap-failed");
  }
}

function safeAIResult(input: {
  provider: string;
  model: string;
  requestId: string | null;
  usage: AIUsage;
  schedule?: AIPriceSchedule;
  at: Date;
  expectedProvider: string;
  expectedModel: string;
}): ResumeGapSafeAIUsage & { estimatedCost: ResumeGapRunResult["estimatedCost"] } {
  const requestId = normalizeStoredIdentifier(input.requestId, 200);
  const configuredSchedule = input.schedule?.provider === input.expectedProvider && input.schedule.model === input.expectedModel
    ? input.schedule
    : undefined;
  const safeScheduleVersion = configuredSchedule
    ? normalizeStoredIdentifier(configuredSchedule.version, 80)
    : null;
  const estimatedCost = configuredSchedule && safeScheduleVersion
    ? estimateAITextCost(input.usage, configuredSchedule, input.at)
    : null;
  return {
    provider: input.provider,
    model: input.model,
    requestId,
    usage: input.usage,
    priceScheduleVersion: estimatedCost && safeScheduleVersion ? safeScheduleVersion : null,
    estimatedCost:
      estimatedCost && safeScheduleVersion
        ? { ...estimatedCost, scheduleVersion: safeScheduleVersion }
        : null,
  };
}

export function createResumeGapService(dependencies: ResumeGapServiceDependencies) {
  const clock = dependencies.clock ?? (() => new Date());

  return {
    async run(input: ResumeGapServiceInput): Promise<ResumeGapServiceResult> {
      assertOwnedInputs(input);
      if (input.run.status === "succeeded") return { run: input.run, reused: true };

      const claimed = await dependencies.runs.claim(input.run.id, 120);
      if (!claimed) {
        const current = await dependencies.runs.getOwned(input.userId, input.run.id);
        if (!current) throw new Error("application-or-resume-not-found");
        return { run: current, reused: true };
      }

      const claimedRun = await dependencies.runs.getOwned(input.userId, input.run.id);
      if (!claimedRun) throw new Error("application-or-resume-not-found");
      const expectedAttemptCount = input.run.attemptCount + 1;
      if (
        claimedRun.status !== "running" ||
        claimedRun.attemptCount !== expectedAttemptCount
      ) {
        return { run: claimedRun, reused: true };
      }

      try {
        const resumeText = await readResumeText(dependencies, input);
        const provider = (input.providerFactory ?? dependencies.providerFactory)();
        const providerInput: ResumeGapAnalysisInput = {
          resumeText,
          requirements: input.requirements,
        };
        const aiResult = await provider.analyzeResumeGaps(providerInput);
        if (
          aiResult.provider !== claimedRun.provider ||
          aiResult.model !== claimedRun.model
        ) {
          throw new Error("resume-gap-failed");
        }
        const parsedUsage = resumeGapAIUsageSchema.safeParse(aiResult.usage);
        if (!parsedUsage.success) throw new Error("resume-gap-failed");
        const sanitized = sanitizeResumeGapOutput({
          resumeText,
          requirements: input.requirements,
          output: aiResult.data,
        });
        const ai = safeAIResult({
          provider: aiResult.provider,
          model: aiResult.model,
          requestId: aiResult.requestId,
          usage: parsedUsage.data,
          schedule: dependencies.priceSchedule,
          at: clock(),
          expectedProvider: claimedRun.provider,
          expectedModel: claimedRun.model,
        });
        const finalAI = resumeGapAIResultSchema.safeParse({
          provider: ai.provider,
          model: ai.model,
          requestId: ai.requestId,
          usage: parsedUsage.data,
          priceScheduleVersion: ai.priceScheduleVersion,
        });
        if (!finalAI.success) throw new Error("resume-gap-failed");
        if (
          ai.estimatedCost !== null &&
          (ai.estimatedCost.scheduleVersion !== ai.priceScheduleVersion)
        ) {
          throw new Error("resume-gap-failed");
        }
        const coveredItemCount = sanitized.items.filter((item) => item.resumeCoverage === "covered").length;
        const partialItemCount = sanitized.items.filter((item) => item.resumeCoverage === "partial").length;
        const missingItemCount = sanitized.items.filter((item) => item.resumeCoverage === "missing").length;
        const finalResult = resumeGapRunResultSchema.safeParse({
          acceptedItemCount: sanitized.items.length,
          coveredItemCount,
          partialItemCount,
          missingItemCount,
          ai: finalAI.data,
          estimatedCost: ai.estimatedCost,
        });
        if (!finalResult.success) throw new Error("resume-gap-failed");
        const completeInput: ResumeGapCompleteInput = {
          runId: input.run.id,
          expectedAttemptCount,
          items: sanitized.items,
          aiUsage: {
            provider: ai.provider,
            model: ai.model,
            requestId: ai.requestId,
            usage: ai.usage,
            priceScheduleVersion: ai.priceScheduleVersion,
          },
          estimatedCost: ai.estimatedCost,
        };
        try {
          const completed = await dependencies.runs.complete(completeInput);
          return { run: completed, reused: false };
        } catch {
          const recovered = await currentAfterWriteFailure(
            dependencies,
            input.userId,
            input.run.id,
            expectedAttemptCount,
          );
          if (recovered) return recovered;
          throw new Error("resume-gap-failed");
        }
      } catch (error) {
        const safe = failure(error);
        try {
          const failed = await dependencies.runs.fail({
            runId: input.run.id,
            expectedAttemptCount,
            errorCode: safe.errorCode,
            errorMessage: safe.errorMessage,
          });
          return { run: failed, reused: false };
        } catch {
          const recovered = await currentAfterWriteFailure(
            dependencies,
            input.userId,
            input.run.id,
            expectedAttemptCount,
          );
          if (recovered) return recovered;
          throw new Error("resume-gap-failed");
        }
      }
    },
  };
}
