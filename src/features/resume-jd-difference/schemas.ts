import { z } from "zod";

import type { ConfirmedFactForAnalysis } from "@/features/career-profile/confirmed-facts";

import { isPasteReadyRewrite } from "./policy";

const localIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z]+-[1-9][0-9]*$/u);

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const differenceIssueTypeSchema = z.enum([
  "missing",
  "language_misaligned",
  "profile_only",
  "skill_only",
  "too_vague",
  "missing_context",
  "missing_result",
  "needs_confirmation",
  "gate",
]);

export const authenticitySchema = z.enum([
  "supported",
  "profile_only",
  "needs_confirmation",
  "unsupported",
]);

export const differencePrioritySchema = z.enum([
  "critical",
  "important",
  "minor",
]);

export const improvementFocusAreaSchema = z.enum([
  "action",
  "context",
  "stakeholders",
  "method",
  "result",
  "placement",
]);

export const resumeTargetSectionSchema = z.enum([
  "summary",
  "experience",
  "project",
  "skills",
  "education",
  "languages",
  "other",
]);

export const jobConceptSchema = z
  .object({
    id: localIdSchema,
    label: boundedText(160),
    originalTerms: z.array(boundedText(160)).min(1).max(12),
    importanceReason: boundedText(600),
    priority: differencePrioritySchema,
  })
  .strict();

export const jobGateSchema = z
  .object({
    id: localIdSchema,
    originalText: boundedText(1_000),
    translation: boundedText(1_500),
    reason: boundedText(600),
  })
  .strict();

export const preferredItemSchema = z
  .object({
    id: localIdSchema,
    originalText: boundedText(1_000),
    translation: boundedText(1_500),
    reason: boundedText(600),
  })
  .strict();

export const differenceIssueSchema = z
  .object({
    id: localIdSchema,
    conceptId: localIdSchema.nullable(),
    jdOriginal: boundedText(1_000),
    jdTranslation: boundedText(1_500),
    resumeExcerpt: boundedText(1_000).nullable(),
    resumeStatus: boundedText(800),
    profileFactIds: z.array(z.uuid()).max(12),
    type: differenceIssueTypeSchema,
    problem: boundedText(800),
    reason: boundedText(1_000),
    priority: differencePrioritySchema,
    isGate: z.boolean(),
    authenticity: authenticitySchema,
  })
  .strict();

export const matchedItemSchema = z
  .object({
    id: localIdSchema,
    conceptId: localIdSchema,
    jdOriginal: boundedText(1_000),
    jdTranslation: boundedText(1_500),
    resumeExcerpt: boundedText(1_000),
    profileFactIds: z.array(z.uuid()).max(12),
    reason: boundedText(800),
  })
  .strict();

export const improvementDirectionSchema = z
  .object({
    id: localIdSchema,
    issueId: localIdSchema,
    targetSection: resumeTargetSectionSchema,
    targetExperience: boundedText(300).nullable(),
    conceptId: localIdSchema.nullable(),
    jdTerms: z.array(boundedText(160)).max(12),
    focusAreas: z.array(improvementFocusAreaSchema).max(6),
    synonymousJobLanguage: z.array(boundedText(160)).max(12),
    authenticity: authenticitySchema,
    needsConfirmation: z.boolean(),
    direction: boundedText(800),
  })
  .strict();

export const resumeJDDifferenceOutputSchema = z
  .object({
    jobCore: z
      .object({
        mission: boundedText(800),
        coreCapabilities: z.array(boundedText(240)).max(5),
        concepts: z.array(jobConceptSchema).min(1).max(24),
        gates: z.array(jobGateSchema).max(16),
        preferredItems: z.array(preferredItemSchema).max(16),
      })
      .strict(),
    overallDifference: z
      .object({
        summary: boundedText(1_000),
        topIssueIds: z.array(localIdSchema).max(3),
      })
      .strict(),
    issues: z.array(differenceIssueSchema).max(80),
    matched: z.array(matchedItemSchema).max(80),
    directions: z.array(improvementDirectionSchema).max(80),
  })
  .strict();

/**
 * The prose keys as they were spelled before there was a second output
 * language, mapped to the names the contract uses now.
 *
 * The `Zh` suffix was not decoration: `looksLikePasteReadyResumeText` read it
 * as a promise that the text was Chinese and skipped its check on any
 * Latin-script sentence. Once the model can answer in English that promise is
 * false, so the suffix had to go — and a run stored under the old spelling has
 * to stay readable, which is what this is for.
 */
const LEGACY_PROSE_KEYS: Record<string, string> = {
  missionZh: "mission",
  overallSummaryZh: "overallSummary",
  summaryZh: "summary",
  labelZh: "label",
  conceptLabelZh: "conceptLabel",
  importanceReasonZh: "importanceReason",
  translationZh: "translation",
  jdTranslationZh: "jdTranslation",
  resumeStatusZh: "resumeStatus",
  problemZh: "problem",
  reasonZh: "reason",
  targetExperienceZh: "targetExperience",
  directionZh: "direction",
};

function renameLegacyProseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(renameLegacyProseKeys);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const renamed = LEGACY_PROSE_KEYS[key];
    // A row already written under the new name wins, and the legacy copy is
    // dropped rather than carried through: renaming into an occupied key
    // would replace live text with stale text, and keeping both would fail
    // the strict object it is about to be handed to.
    if (renamed && renamed in value) continue;
    out[renamed ?? key] = renameLegacyProseKeys(entry);
  }
  return out;
}

/**
 * What a *stored* run parses with.
 *
 * Deliberately not the schema the provider is held to: a fresh response has
 * to use the current names, or the contract would have two spellings forever
 * and nothing would ever force the model onto one of them.
 */
export const storedResumeJDDifferenceOutputSchema = z.preprocess(
  renameLegacyProseKeys,
  resumeJDDifferenceOutputSchema,
);

export type DifferenceIssueType = z.infer<typeof differenceIssueTypeSchema>;
export type DifferenceAuthenticity = z.infer<typeof authenticitySchema>;
export type DifferencePriority = z.infer<typeof differencePrioritySchema>;
export type ImprovementFocusArea = z.infer<
  typeof improvementFocusAreaSchema
>;
export type ResumeTargetSection = z.infer<typeof resumeTargetSectionSchema>;
export type JobConcept = z.infer<typeof jobConceptSchema>;
export type DifferenceIssue = z.infer<typeof differenceIssueSchema>;
export type ImprovementDirection = z.infer<
  typeof improvementDirectionSchema
>;
export type ResumeJDDifferenceOutput = z.infer<
  typeof resumeJDDifferenceOutputSchema
>;

export type ResumeJDDifferenceInput = {
  jdText: string;
  resumeText: string;
  confirmedFacts: ConfirmedFactForAnalysis[];
};

export type DifferenceGraphErrorCode =
  | "duplicate-id"
  | "top-issue-not-found"
  | "issue-concept-not-found"
  | "matched-concept-not-found"
  | "direction-issue-not-found"
  | "direction-concept-not-found"
  | "issue-direction-missing"
  | "gate-flag-invalid"
  | "unsupported-language-suggestion-not-allowed"
  | "paste-ready-rewrite-not-allowed";

export type DifferenceGraphValidation =
  | { ok: true }
  | { ok: false; code: DifferenceGraphErrorCode };

function hasDuplicateIds(output: ResumeJDDifferenceOutput) {
  const ids = [
    ...output.jobCore.concepts.map((item) => item.id),
    ...output.jobCore.gates.map((item) => item.id),
    ...output.jobCore.preferredItems.map((item) => item.id),
    ...output.issues.map((item) => item.id),
    ...output.matched.map((item) => item.id),
    ...output.directions.map((item) => item.id),
  ];
  return new Set(ids).size !== ids.length;
}


export function validateResumeJDDifferenceGraph(
  output: ResumeJDDifferenceOutput,
): DifferenceGraphValidation {
  if (hasDuplicateIds(output)) return { ok: false, code: "duplicate-id" };

  const conceptIds = new Set(output.jobCore.concepts.map((item) => item.id));
  const issueIds = new Set(output.issues.map((item) => item.id));
  const directionIssueIds = new Set(
    output.directions.map((item) => item.issueId),
  );

  if (output.overallDifference.topIssueIds.some((id) => !issueIds.has(id))) {
    return { ok: false, code: "top-issue-not-found" };
  }

  for (const direction of output.directions) {
    if (!issueIds.has(direction.issueId)) {
      return { ok: false, code: "direction-issue-not-found" };
    }
    if (direction.conceptId && !conceptIds.has(direction.conceptId)) {
      return { ok: false, code: "direction-concept-not-found" };
    }
  }

  for (const issue of output.issues) {
    if (issue.conceptId && !conceptIds.has(issue.conceptId)) {
      return { ok: false, code: "issue-concept-not-found" };
    }
    if ((issue.type === "gate") !== issue.isGate) {
      return { ok: false, code: "gate-flag-invalid" };
    }
    if (!issue.isGate && !directionIssueIds.has(issue.id)) {
      return { ok: false, code: "issue-direction-missing" };
    }
  }

  if (output.matched.some((item) => !conceptIds.has(item.conceptId))) {
    return { ok: false, code: "matched-concept-not-found" };
  }

  for (const direction of output.directions) {
    if (
      direction.authenticity === "unsupported" &&
      (direction.synonymousJobLanguage.length > 0 || !direction.needsConfirmation)
    ) {
      return {
        ok: false,
        code: "unsupported-language-suggestion-not-allowed",
      };
    }
    if (isPasteReadyRewrite(direction.direction)) {
      return { ok: false, code: "paste-ready-rewrite-not-allowed" };
    }
  }

  return { ok: true };
}
