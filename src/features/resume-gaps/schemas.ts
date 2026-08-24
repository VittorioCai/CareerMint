import { z } from "zod";

import type { AIUsage } from "@/features/extraction/provider";
import {
  normalizeForMatching,
  unicodeCodePointLength,
} from "@/features/extraction/evidence";
import {
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

export type ResumeGapRequirement = {
  id: string;
  category: RequirementCategory;
  text: string;
  priority: z.infer<typeof requirementPrioritySchema>;
  sortOrder?: number;
  sourceExcerpt?: string;
  matchStatus?: RequirementMatchStatus;
  matchReason?: string | null;
};

export type ResumeGapAnalysisInput = {
  resumeText: string;
  requirements: Array<
    Pick<ResumeGapRequirement, "id" | "category" | "text" | "priority">
  >;
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
  requirements: ResumeGapRequirement[];
  output: unknown;
}): SanitizedResumeGapOutput {
  const parsed = resumeGapProviderOutputSchema.safeParse(input.output);
  if (!parsed.success || typeof input.resumeText !== "string") invalidOutput();

  const knownRequirements = new Map<string, ResumeGapRequirement>();
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

export type ResumeGapItem = {
  id: string;
  runId: string;
  applicationId: string;
  userId: string;
  requirementId: string;
  requirementText: string;
  category: RequirementCategory;
  priority: z.infer<typeof requirementPrioritySchema>;
  jdSourceExcerpt: string;
  resumeCoverage: ResumeCoverage;
  verifiedResumeExcerpt: string | null;
  sortOrder: number;
  createdAt?: string;
};

export type ResumeGapItemView = ResumeGapItem & {
  profileEvidence: ConfirmedFactForAnalysis[];
  matchStatus?: RequirementMatchStatus;
  matchReason?: string | null;
};

export function classifyGap(item: ResumeGapItemView): ResumeGapGroup {
  if (item.resumeCoverage === "covered") return "covered";
  if (item.resumeCoverage === "partial") return "partial_coverage";
  return item.profileEvidence.length > 0
    ? "resume_omission"
    : "missing_evidence";
}

export function explainGap(item: ResumeGapItemView): string {
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
  requirement: Pick<ResumeGapRequirement, "matchStatus">,
): ProfileOnlyGroup {
  switch (requirement.matchStatus) {
    case "evidence":
      return "profile_supported";
    case "partial":
      return "partial_match";
    case "needs_user":
      return "needs_user";
    case "none":
    default:
      return "missing_evidence";
  }
}

function priorityRank(requirement: ResumeGapRequirement) {
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
  requirements: ResumeGapRequirement[],
  limit = 5,
): ResumeGapRequirement[] {
  if (limit <= 0) return [];
  return requirements
    .map((requirement, index) => ({
      requirement,
      index,
      rank: priorityRank(requirement),
      order: requirement.sortOrder ?? index,
    }))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.order - right.order ||
        left.index - right.index,
    )
    .slice(0, limit)
    .map(({ requirement }) => requirement);
}

export function summarizeRequirements(requirements: ResumeGapRequirement[]) {
  return requirements.reduce(
    (summary, requirement) => {
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
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(160),
  requestId: z.string().trim().min(1).max(200).nullable(),
  usage: resumeGapAIUsageSchema,
  priceScheduleVersion: z.string().trim().min(1).max(80).nullable(),
}).strict();

export const resumeGapEstimatedCostSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.literal("USD"),
  scheduleVersion: z.string().trim().min(1).max(80),
  tier: z.enum(["default", "peak"]),
}).strict();

export const resumeGapRunResultSchema = z.object({
  acceptedItemCount: z.number().int().nonnegative(),
  coveredItemCount: z.number().int().nonnegative(),
  partialItemCount: z.number().int().nonnegative(),
  missingItemCount: z.number().int().nonnegative(),
  ai: resumeGapAIResultSchema,
  estimatedCost: resumeGapEstimatedCostSchema.nullable(),
}).strict();

export type ResumeGapAI = z.infer<typeof resumeGapAIResultSchema>;
export type ResumeGapRunResult = z.infer<typeof resumeGapRunResultSchema>;

export const resumeGapRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export type ResumeGapRunStatus = z.infer<typeof resumeGapRunStatusSchema>;

export type ResumeGapRun = {
  id: string;
  applicationId: string;
  userId: string;
  analysisRunId: string;
  sourceAssetId: string | null;
  sourceFilename: string;
  sourceSha256: string;
  inputHash: string;
  provider: string;
  model: string;
  status: ResumeGapRunStatus;
  attemptCount: number;
  result: ResumeGapRunResult | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type ResumeGapAIUsage = Pick<
  ResumeGapAI,
  "provider" | "model" | "requestId" | "usage" | "priceScheduleVersion"
>;
export type ResumeGapSafeAIUsage = ResumeGapAIUsage & { usage: AIUsage };

export type ResumeGapCompleteResult = ResumeGapRunResult;
