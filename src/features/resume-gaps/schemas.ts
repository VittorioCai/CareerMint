import { z } from "zod";

import type { AIUsage } from "@/features/extraction/provider";
import {
  normalizeForMatching,
  unicodeCodePointLength,
} from "@/features/extraction/evidence";
import {
  requirementCategorySchema,
  requirementPrioritySchema,
  type ConfirmedFactForAnalysis,
  type RequirementCategory,
  type RequirementMatchStatus,
} from "@/features/jd-analysis/schemas";

export const resumeCoverageSchema = z.enum(["covered", "partial", "missing"]);

export const resumeGapProviderItemSchema = z
  .object({
    requirementId: z.uuid(),
    resumeCoverage: resumeCoverageSchema,
    resumeExcerpt: z
      .string()
      .trim()
      .refine((value) => unicodeCodePointLength(value) <= 700, {
        message: "Resume excerpts must contain at most 700 Unicode characters.",
      })
      .min(1)
      .nullable(),
  })
  .strict();

export const resumeGapProviderOutputSchema = z
  .object({
    items: z.array(resumeGapProviderItemSchema).max(80),
  })
  .strict();

export type ResumeCoverage = z.infer<typeof resumeCoverageSchema>;
export type ResumeGapProviderItem = z.infer<typeof resumeGapProviderItemSchema>;
export type ResumeGapProviderOutput = z.infer<
  typeof resumeGapProviderOutputSchema
>;

export type ResumeGapProviderRequirement = {
  id: string;
  category: RequirementCategory;
  text: string;
  priority: z.infer<typeof requirementPrioritySchema>;
};

/** Provider input intentionally excludes profile match metadata. */
export type ResumeGapRequirement = ResumeGapProviderRequirement;

/** Current JD views must carry an explicit match status. */
export type ResumeGapCurrentRequirement = ResumeGapProviderRequirement & {
  sortOrder: number;
  sourceExcerpt?: string;
  matchStatus: RequirementMatchStatus;
  matchReason?: string | null;
};

export type ResumeGapAnalysisInput = {
  resumeText: string;
  requirements: ResumeGapProviderRequirement[];
};

export type SanitizedResumeGapOutput = {
  items: ResumeGapProviderItem[];
};

function invalidOutput(): never {
  throw new Error("resume-gap-invalid-output");
}

/**
 * Parse and ground the provider result as one atomic operation. A single
 * unknown, duplicate, missing, or ungrounded row invalidates the whole run.
 */
export function sanitizeResumeGapOutput(input: {
  resumeText: string;
  requirements: ResumeGapProviderRequirement[];
  output: unknown;
}): SanitizedResumeGapOutput {
  const parsed = resumeGapProviderOutputSchema.safeParse(input.output);
  if (!parsed.success || typeof input.resumeText !== "string") invalidOutput();

  const knownRequirements = new Map<string, ResumeGapProviderRequirement>();
  for (const requirement of input.requirements) {
    if (knownRequirements.has(requirement.id)) invalidOutput();
    knownRequirements.set(requirement.id, requirement);
  }

  const seen = new Set<string>();
  const normalizedResume = normalizeForMatching(input.resumeText);
  const items: ResumeGapProviderItem[] = [];

  for (const candidate of parsed.data.items) {
    if (!knownRequirements.has(candidate.requirementId)) invalidOutput();
    if (seen.has(candidate.requirementId)) invalidOutput();
    seen.add(candidate.requirementId);

    if (candidate.resumeCoverage === "missing") {
      if (candidate.resumeExcerpt !== null) invalidOutput();
    } else {
      const excerpt = candidate.resumeExcerpt;
      if (
        excerpt === null ||
        excerpt.trim().length === 0 ||
        unicodeCodePointLength(excerpt) > 700
      ) {
        invalidOutput();
      }
      const normalizedExcerpt = normalizeForMatching(excerpt);
      if (
        normalizedExcerpt.length === 0 ||
        !normalizedResume.includes(normalizedExcerpt)
      ) {
        invalidOutput();
      }
    }

    items.push(candidate);
  }

  if (seen.size !== knownRequirements.size) invalidOutput();

  const orderedItems = input.requirements.map((requirement) => {
    const item = items.find(
      (candidate) => candidate.requirementId === requirement.id,
    );
    return item ?? invalidOutput();
  });

  return { items: orderedItems };
}

export type ResumeGapGroup =
  | "covered"
  | "partial_coverage"
  | "resume_omission"
  | "missing_evidence";

export const resumeGapGroupSchema = z.enum([
  "covered",
  "partial_coverage",
  "resume_omission",
  "missing_evidence",
]);

const storedText = (max: number) =>
  z
    .string()
    .refine(
      (value) =>
        value === value.trim() &&
        unicodeCodePointLength(value) >= 1 &&
        unicodeCodePointLength(value) <= max,
    );

const storedToken = (max: number) =>
  storedText(max).regex(/^[A-Za-z0-9._:-]+$/u);

export function normalizeStoredIdentifier(
  value: unknown,
  max = 200,
): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return storedToken(max).safeParse(candidate).success ? candidate : null;
}

export const resumeGapItemSchema = z
  .object({
    id: z.uuid(),
    runId: z.uuid(),
    applicationId: z.uuid(),
    userId: z.uuid(),
    requirementId: z.uuid().nullable(),
    requirementText: storedText(500),
    category: requirementCategorySchema,
    priority: requirementPrioritySchema,
    jdSourceExcerpt: storedText(1000),
    resumeCoverage: resumeCoverageSchema,
    verifiedResumeExcerpt: storedText(1000).nullable(),
    sortOrder: z.number().int().min(0).max(79),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((item, context) => {
    const missingExcerpt = item.verifiedResumeExcerpt === null;
    if (
      (item.resumeCoverage === "missing" && !missingExcerpt) ||
      (item.resumeCoverage !== "missing" && missingExcerpt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["verifiedResumeExcerpt"],
        message: "Resume excerpt must match coverage.",
      });
    }
  });

export type ResumeGapItem = z.infer<typeof resumeGapItemSchema>;

export type ResumeGapItemView = ResumeGapItem & {
  profileEvidence: ConfirmedFactForAnalysis[];
  matchStatus?: RequirementMatchStatus;
  matchReason?: string | null;
};

export type ResumeGapClassificationInput = {
  resumeCoverage: ResumeCoverage;
  profileEvidence: readonly unknown[];
};

export function classifyGap(item: ResumeGapClassificationInput): ResumeGapGroup {
  if (item.resumeCoverage === "covered") return "covered";
  if (item.resumeCoverage === "partial") return "partial_coverage";
  return item.profileEvidence.length > 0
    ? "resume_omission"
    : "missing_evidence";
}

export function explainGap(item: ResumeGapClassificationInput): string {
  switch (classifyGap(item)) {
    case "covered":
      return "当前简历已明确覆盖这项要求。";
    case "partial_coverage":
      return "当前简历仅部分覆盖这项要求。";
    case "resume_omission":
      return `当前简历未出现这项要求，但职业档案中已有 ${item.profileEvidence.length} 条已确认事实。`;
    case "missing_evidence":
      return "当前简历未出现这项要求，职业档案中也没有已确认事实。";
  }
}

export type ProfileOnlyGroup =
  | "profile_supported"
  | "partial_match"
  | "missing_evidence"
  | "needs_user";

export const profileOnlyGroupSchema = z.enum([
  "profile_supported",
  "partial_match",
  "missing_evidence",
  "needs_user",
]);

export function classifyProfileOnlyRequirement(
  requirement: Pick<ResumeGapCurrentRequirement, "matchStatus">,
): ProfileOnlyGroup {
  if (!requirement.matchStatus) {
    throw new Error("resume-gap-invalid-requirement");
  }
  switch (requirement.matchStatus) {
    case "evidence":
      return "profile_supported";
    case "partial":
      return "partial_match";
    case "needs_user":
      return "needs_user";
    case "none":
      return "missing_evidence";
  }
}

function priorityRank(requirement: ResumeGapCurrentRequirement) {
  if (!requirement.matchStatus) {
    throw new Error("resume-gap-invalid-requirement");
  }
  if (requirement.matchStatus === "evidence") return 5;
  if (requirement.priority === "core") {
    if (requirement.matchStatus === "none") return 0;
    if (requirement.matchStatus === "needs_user") return 1;
    if (requirement.matchStatus === "partial") return 2;
    return 5;
  }
  if (requirement.matchStatus === "none") return 3;
  if (
    requirement.matchStatus === "needs_user" ||
    requirement.matchStatus === "partial"
  ) {
    return 4;
  }
  return 6;
}

export function selectPriorityRequirements(
  requirements: ResumeGapCurrentRequirement[],
  limit = 5,
): ResumeGapCurrentRequirement[] {
  // The priority view is intentionally capped at five. Invalid numeric input
  // is treated as requesting no rows rather than bypassing that hard cap.
  if (!Number.isFinite(limit)) return [];
  const safeLimit = Math.max(0, Math.min(5, Math.floor(limit)));
  if (safeLimit === 0) return [];
  return requirements
    .map((requirement, index) => ({
      requirement,
      index,
      rank: priorityRank(requirement),
      order: requirement.sortOrder,
    }))
    .sort(
      (left, right) => {
        const rankDifference = left.rank - right.rank;
        if (rankDifference !== 0) return rankDifference;
        const orderDifference = left.order - right.order;
        if (orderDifference !== 0) return orderDifference;
        return left.index - right.index;
      },
    )
    .slice(0, safeLimit)
    .map(({ requirement }) => requirement);
}

export function summarizeRequirements(requirements: ResumeGapCurrentRequirement[]) {
  return requirements.reduce(
    (summary, requirement) => {
      if (!requirement.matchStatus) {
        throw new Error("resume-gap-invalid-requirement");
      }
      summary.total += 1;
      if (requirement.priority === "core") summary.core += 1;
      if (requirement.matchStatus === "evidence") summary.evidence += 1;
      if (
        requirement.priority === "core" &&
        (requirement.matchStatus === "partial" ||
          requirement.matchStatus === "none" ||
          requirement.matchStatus === "needs_user")
      ) {
        summary.attention += 1;
      }
      return summary;
    },
    { total: 0, core: 0, evidence: 0, attention: 0 },
  );
}

export const resumeGapAIUsageSchema = z.object({
  inputCacheHitTokens: z.number().int().nonnegative().max(2147483647),
  inputCacheMissTokens: z.number().int().nonnegative().max(2147483647),
  outputTokens: z.number().int().nonnegative().max(2147483647),
}).strict();

export const resumeGapAIResultSchema = z.object({
  provider: storedText(80),
  model: storedText(160),
  requestId: storedToken(200).nullable(),
  usage: resumeGapAIUsageSchema,
  priceScheduleVersion: storedToken(80).nullable(),
}).strict();

export const resumeGapEstimatedCostSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.literal("USD"),
  scheduleVersion: storedToken(80),
  tier: z.enum(["default", "peak"]),
}).strict();

export const resumeGapRunResultSchema = z.object({
  acceptedItemCount: z.number().int().min(0).max(80),
  coveredItemCount: z.number().int().min(0).max(80),
  partialItemCount: z.number().int().min(0).max(80),
  missingItemCount: z.number().int().min(0).max(80),
  ai: resumeGapAIResultSchema,
  estimatedCost: resumeGapEstimatedCostSchema.nullable(),
})
  .strict()
  .superRefine((result, context) => {
    const evidenceCount =
      result.coveredItemCount +
      result.partialItemCount +
      result.missingItemCount;
    if (
      result.acceptedItemCount !== evidenceCount ||
      result.acceptedItemCount > 80
    ) {
      context.addIssue({
        code: "custom",
        path: ["acceptedItemCount"],
        message: "Result counts must sum to at most 80 accepted items.",
      });
    }
    if (
      result.estimatedCost !== null &&
      (result.ai.priceScheduleVersion === null ||
        result.ai.priceScheduleVersion !== result.estimatedCost.scheduleVersion)
    ) {
      context.addIssue({
        code: "custom",
        path: ["estimatedCost", "scheduleVersion"],
        message: "Estimated cost schedule must match AI metadata.",
      });
    }
  });

export type ResumeGapAI = z.infer<typeof resumeGapAIResultSchema>;
export type ResumeGapRunResult = z.infer<typeof resumeGapRunResultSchema>;

export const resumeGapRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export type ResumeGapRunStatus = z.infer<typeof resumeGapRunStatusSchema>;

export const resumeGapRunSchema = z
  .object({
    id: z.uuid(),
    applicationId: z.uuid(),
    userId: z.uuid(),
    analysisRunId: z.uuid(),
    sourceAssetId: z.uuid().nullable(),
    sourceFilename: storedText(260),
    sourceSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    inputHash: z.string().regex(/^[0-9a-f]{64}$/u),
    provider: storedText(80),
    model: storedText(160),
    status: resumeGapRunStatusSchema,
    attemptCount: z.number().int().min(0).max(1000),
    result: resumeGapRunResultSchema.nullable(),
    errorCode: storedText(120).nullable(),
    errorMessage: storedText(500).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    startedAt: z.string().datetime({ offset: true }).nullable(),
    finishedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((run, context) => {
    if ((run.errorCode === null) !== (run.errorMessage === null)) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "errorCode and errorMessage must be set together.",
      });
    }

    const isQueued =
      run.status === "queued" &&
      run.attemptCount === 0 &&
      run.startedAt === null &&
      run.finishedAt === null &&
      run.errorCode === null &&
      run.errorMessage === null &&
      run.result === null;
    const isRunning =
      run.status === "running" &&
      run.attemptCount > 0 &&
      run.startedAt !== null &&
      run.finishedAt === null &&
      run.errorCode === null &&
      run.errorMessage === null &&
      run.result === null;
    const isSucceeded =
      run.status === "succeeded" &&
      run.attemptCount > 0 &&
      run.startedAt !== null &&
      run.finishedAt !== null &&
      run.errorCode === null &&
      run.errorMessage === null &&
      run.result !== null;
    const isFailed =
      run.status === "failed" &&
      run.attemptCount > 0 &&
      run.startedAt !== null &&
      run.finishedAt !== null &&
      run.errorCode !== null &&
      run.errorMessage !== null &&
      run.result === null;
    if (!(isQueued || isRunning || isSucceeded || isFailed)) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Run state does not match its stored fields.",
      });
    }
  });

export type ResumeGapRun = z.infer<typeof resumeGapRunSchema>;

export type ResumeGapAIUsage = Pick<
  ResumeGapAI,
  "provider" | "model" | "requestId" | "usage" | "priceScheduleVersion"
>;
export type ResumeGapSafeAIUsage = ResumeGapAIUsage & { usage: AIUsage };

export type ResumeGapCompleteResult = ResumeGapRunResult;
