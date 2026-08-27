import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost } from "@/features/ai/pricing";
import type { AIProvider, AIUsage } from "@/features/extraction/provider";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import { extractResumeText, normalizeResumeText } from "@/features/source-assets/parsers";
import type { SourceAsset } from "@/features/source-assets/repository";
import { downloadSource } from "@/features/source-assets/storage";

import type {
  JDGapAssessmentForPersistence,
  JDGapV3Run,
} from "./gap-repository";
import type { ComparisonPromptVariant } from "./prompts";
import { aggregateRequirement, applyDeterministicCriterionPolicy } from "./policy";
import { sanitizeJDGapComparisonOutput } from "./sanitizers";
import {
  aiMetadataSchema,
  estimatedCostSchema,
  type AIMetadata,
  type EstimatedCost,
  type JDGapRequirementForComparison,
  type JDGapRequirementResult,
} from "./schemas";
import type { JDStructureRun } from "./structure-repository";

const SAFE_ERROR_MESSAGE = "Resume comparison failed.";
const SAFE_ERROR_CODES = new Set([
  "jd-structure-invalid-output",
  "jd-gap-invalid-output",
  "resume-text-too-short",
  "resume-text-too-long",
  "unsupported-content-type",
  "source-download-failed",
  "ai-provider-rate-limited",
  "ai-provider-request-failed",
  "ai-provider-timeout",
]);

type GapRepository = {
  claim(
    runId: string,
    expectedAttemptCount: number,
    expectedStatus: "queued" | "running" | "failed",
    leaseSeconds?: number,
  ): Promise<boolean>;
  getOwned(userId: string, runId: string): Promise<JDGapV3Run | null>;
  complete(input: {
    runId: string;
    expectedAttemptCount: number;
    requirementResults: JDGapRequirementResult[];
    assessments: JDGapAssessmentForPersistence[];
    ai: AIMetadata;
    estimatedCost: EstimatedCost | null;
  }): Promise<JDGapV3Run>;
  fail(input: {
    runId: string;
    expectedAttemptCount: number;
    errorCode: string;
    errorMessage: string;
  }): Promise<JDGapV3Run>;
};

export type JDGapComparisonServiceDependencies = {
  runs: GapRepository;
  storage?: { download(storagePath: string): Promise<Blob> };
  parser?: (buffer: Buffer, contentType: string) => Promise<string>;
  providerFactory(): Pick<AIProvider, "compareJDGapCriteria">;
  promptVariant?: ComparisonPromptVariant;
  priceSchedule?: AIPriceSchedule;
  clock?: () => Date;
};

export type JDGapComparisonServiceInput = {
  userId: string;
  run: JDGapV3Run;
  structureRun: JDStructureRun;
  asset: SourceAsset;
  requirements: JDGapRequirementForComparison[];
  confirmedFacts: ConfirmedFactForAnalysis[];
  ocrText?: string;
};

export type JDGapComparisonServiceResult = {
  run: JDGapV3Run;
  reused: boolean;
};

function safeIdentifier(value: string | null, max: number) {
  if (value === null) return null;
  const candidate = value.trim();
  return candidate.length >= 1 && candidate.length <= max && /^[A-Za-z0-9._:-]+$/u.test(candidate)
    ? candidate
    : null;
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "deepseek-api-key-missing" || code === "ai-provider-authentication-failed") {
    return { errorCode: "jd-gap-unavailable", errorMessage: SAFE_ERROR_MESSAGE };
  }
  return {
    errorCode: SAFE_ERROR_CODES.has(code) ? code : "jd-gap-failed",
    errorMessage: SAFE_ERROR_MESSAGE,
  };
}

function metadata(input: {
  provider: string;
  model: string;
  requestId: string | null;
  usage: AIUsage;
  expectedProvider: string;
  expectedModel: string;
  schedule?: AIPriceSchedule;
  at: Date;
}) {
  if (input.provider !== input.expectedProvider || input.model !== input.expectedModel) {
    throw new Error("jd-gap-failed");
  }
  const schedule = input.schedule?.provider === input.provider &&
      input.schedule.model === input.model
    ? input.schedule
    : undefined;
  const scheduleVersion = schedule ? safeIdentifier(schedule.version, 80) : null;
  const estimated = schedule && scheduleVersion
    ? estimateAITextCost(input.usage, schedule, input.at)
    : null;
  const estimatedCost = estimated && scheduleVersion
    ? estimatedCostSchema.parse({ ...estimated, scheduleVersion })
    : null;
  const ai = aiMetadataSchema.parse({
    provider: input.provider,
    model: input.model,
    requestId: safeIdentifier(input.requestId, 200),
    usage: input.usage,
    priceScheduleVersion: estimatedCost ? scheduleVersion : null,
  });
  return { ai, estimatedCost };
}

function assertOwned(input: JDGapComparisonServiceInput) {
  if (
    input.run.userId !== input.userId ||
    input.structureRun.userId !== input.userId ||
    input.asset.userId !== input.userId ||
    input.run.applicationId !== input.structureRun.applicationId ||
    input.run.structureRunId !== input.structureRun.id ||
    input.structureRun.status !== "succeeded" ||
    input.run.sourceAssetId !== input.asset.id ||
    input.run.sourceFilename !== input.asset.originalName ||
    input.run.sourceSha256 !== input.asset.sha256 ||
    (input.asset.status !== "uploaded" && input.asset.status !== "ready")
  ) {
    throw new Error("application-or-resume-not-found");
  }
  if (input.requirements.length === 0) throw new Error("jd-structure-required");
}

async function readResumeText(
  dependencies: JDGapComparisonServiceDependencies,
  input: JDGapComparisonServiceInput,
) {
  if (input.ocrText !== undefined) return normalizeResumeText(input.ocrText);
  const storage = dependencies.storage ?? { download: downloadSource };
  const parser = dependencies.parser ?? extractResumeText;
  let source: Blob;
  try {
    source = await storage.download(input.asset.storagePath);
  } catch {
    throw new Error("source-download-failed");
  }
  try {
    const extracted = await parser(
      Buffer.from(await source.arrayBuffer()),
      input.asset.contentType,
    );
    return normalizeResumeText(extracted);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (
      code === "unsupported-content-type" ||
      code === "resume-text-too-short" ||
      code === "resume-text-too-long"
    ) {
      throw error;
    }
    throw new Error("jd-gap-failed");
  }
}

function authorizationFactIds(facts: ConfirmedFactForAnalysis[]) {
  const pattern = /\b(?:authorized to work|work authorization|visa|arbeitserlaubnis|arbeitsberechtigung)\b/iu;
  return facts
    .filter((fact) =>
      pattern.test(`${fact.title}\n${fact.description}\n${fact.sourceExcerpt ?? ""}`),
    )
    .map((fact) => fact.id);
}

async function recoverCurrent(
  runs: GapRepository,
  userId: string,
  runId: string,
  expectedAttemptCount: number,
) {
  const current = await runs.getOwned(userId, runId);
  return current && (
    current.status === "succeeded" ||
    current.status === "failed" ||
    current.attemptCount !== expectedAttemptCount
  )
    ? current
    : null;
}

export function createJDGapComparisonService(
  dependencies: JDGapComparisonServiceDependencies,
) {
  const clock = dependencies.clock ?? (() => new Date());
  const promptVariant = dependencies.promptVariant ?? "p3";

  return {
    async run(
      input: JDGapComparisonServiceInput,
    ): Promise<JDGapComparisonServiceResult> {
      assertOwned(input);
      if (input.run.status === "succeeded") {
        return { run: input.run, reused: true };
      }

      const expectedAttemptCount = input.run.attemptCount + 1;
      const claimed = await dependencies.runs.claim(
        input.run.id,
        input.run.attemptCount,
        input.run.status,
        120,
      );
      if (!claimed) {
        const current = await dependencies.runs.getOwned(input.userId, input.run.id);
        if (!current) throw new Error("application-or-resume-not-found");
        return { run: current, reused: true };
      }

      const claimedRun = await dependencies.runs.getOwned(input.userId, input.run.id);
      if (!claimedRun) throw new Error("application-or-resume-not-found");
      if (
        claimedRun.status !== "running" ||
        claimedRun.attemptCount !== expectedAttemptCount
      ) {
        return { run: claimedRun, reused: true };
      }

      try {
        const resumeText = await readResumeText(dependencies, input);
        const provider = dependencies.providerFactory();
        const aiResult = await provider.compareJDGapCriteria(
          {
            resumeText,
            requirements: input.requirements,
            confirmedFacts: input.confirmedFacts,
          },
          { promptVariant },
        );
        const sanitized = sanitizeJDGapComparisonOutput({
          resumeText,
          requirements: input.requirements,
          confirmedFacts: input.confirmedFacts,
          confirmedAuthorizationFactIds: authorizationFactIds(input.confirmedFacts),
          output: aiResult.data,
        });
        const requirementByCriterion = new Map<string, JDGapRequirementForComparison>();
        for (const requirement of input.requirements) {
          for (const criterion of requirement.criteria) {
            if (requirementByCriterion.has(criterion.id)) {
              throw new Error("jd-gap-invalid-output");
            }
            requirementByCriterion.set(criterion.id, requirement);
          }
        }
        const assessments: JDGapAssessmentForPersistence[] = sanitized.assessments.map(
          (assessment) => {
            const requirement = requirementByCriterion.get(assessment.criterionId);
            const criterion = requirement?.criteria.find(
              (candidate) => candidate.id === assessment.criterionId,
            );
            if (!requirement || !criterion) throw new Error("jd-gap-invalid-output");
            return {
              ...applyDeterministicCriterionPolicy({
                requirement,
                criterion,
                assessment,
              }),
              requirementId: requirement.id,
            };
          },
        );
        const requirementResults = input.requirements.map((requirement) =>
          aggregateRequirement({
            requirementId: requirement.id,
            requirementType: requirement.requirementType,
            explicitGate: requirement.explicitGate,
            allowsEquivalent: requirement.allowsEquivalent,
            criteria: requirement.criteria,
            assessments: assessments.filter(
              (assessment) => assessment.requirementId === requirement.id,
            ),
            sourceOrder: requirement.sortOrder,
          }),
        );
        const safe = metadata({
          ...aiResult,
          expectedProvider: claimedRun.provider,
          expectedModel: claimedRun.model,
          schedule: dependencies.priceSchedule,
          at: clock(),
        });
        try {
          const completed = await dependencies.runs.complete({
            runId: input.run.id,
            expectedAttemptCount,
            requirementResults,
            assessments,
            ...safe,
          });
          return { run: completed, reused: false };
        } catch {
          const recovered = await recoverCurrent(
            dependencies.runs,
            input.userId,
            input.run.id,
            expectedAttemptCount,
          );
          if (recovered) return { run: recovered, reused: true };
          throw new Error("jd-gap-failed");
        }
      } catch (error) {
        const safe = failure(error);
        try {
          const failed = await dependencies.runs.fail({
            runId: input.run.id,
            expectedAttemptCount,
            ...safe,
          });
          return { run: failed, reused: false };
        } catch {
          const recovered = await recoverCurrent(
            dependencies.runs,
            input.userId,
            input.run.id,
            expectedAttemptCount,
          );
          if (recovered) return { run: recovered, reused: true };
          throw new Error("jd-gap-failed");
        }
      }
    },
  };
}
