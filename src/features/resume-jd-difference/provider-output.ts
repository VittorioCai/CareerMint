import { z } from "zod";

import type { Dictionary } from "@/i18n/dictionaries/en";
import type { AppLocale } from "@/i18n/locale";
import { dictionaryFor } from "@/i18n/dictionary";

import {
  differenceIssueTypeSchema,
  differencePrioritySchema,
  improvementFocusAreaSchema,
  resumeJDDifferenceOutputSchema,
  resumeTargetSectionSchema,
  type DifferenceAuthenticity,
  type DifferenceIssueType,
  type ResumeJDDifferenceOutput,
} from "./schemas";

const SEGMENT_MAX_LENGTH = 1_000;
const MAX_GATES = 16;
const MAX_PREFERRED_ITEMS = 16;
/**
 * The sentences this module writes when the model left a field out, in the
 * language the run is in.
 *
 * They used to be module constants in Chinese, which meant a repaired English
 * run came back with one Chinese sentence in the middle of it. Resolving them
 * from the run's locale keeps a repair invisible rather than jarring.
 */
export type DifferenceOutputCopy = {
  noEvidence: string;
  profileOnlyStatus: string;
  fallbacks: Dictionary["difference"]["fallbacks"];
};

export function differenceOutputCopy(locale: AppLocale): DifferenceOutputCopy {
  const { difference } = dictionaryFor(locale);
  return {
    noEvidence: difference.noEvidence,
    profileOnlyStatus: difference.profileOnlyStatus,
    fallbacks: difference.fallbacks,
  };
}

export type DifferenceSourceSegment = {
  id: string;
  text: string;
};

const sourceSegmentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^(?:jd|resume)-[1-9][0-9]*$/u);
const boundedText = (max: number) => z.string().trim().min(1).max(max);

const providerImprovementSchema = z
  .object({
    targetSection: resumeTargetSectionSchema,
    targetExperience: boundedText(300).nullable(),
    focusAreas: z.array(improvementFocusAreaSchema).max(6),
    synonymousJobLanguage: z.array(boundedText(160)).max(12),
    needsConfirmation: z.boolean(),
    direction: boundedText(800),
  })
  .strict();

const providerRequirementSchema = z
  .object({
    jdSegmentId: sourceSegmentIdSchema,
    kind: z.enum(["core", "gate", "preferred"]),
    comparisonMode: z.enum(["semantic", "strict"]),
    conceptLabel: boundedText(160),
    jdTerms: z.array(boundedText(160)).max(12),
    importanceReason: boundedText(600),
    priority: differencePrioritySchema,
    translation: boundedText(1_500),
    assessment: z.enum([
      "matched",
      "partial",
      "missing",
      "profile_only",
      "needs_confirmation",
    ]),
    resumeSegmentId: sourceSegmentIdSchema.nullable(),
    profileFactIds: z.array(z.uuid()).max(12),
    gapType: differenceIssueTypeSchema.nullable(),
    resumeStatus: boundedText(800),
    problem: boundedText(800).nullable(),
    reason: boundedText(1_000),
    improvement: providerImprovementSchema.nullable(),
  })
  .strict();

export const resumeJDDifferenceProviderOutputSchema = z
  .object({
    mission: boundedText(800),
    coreCapabilities: z.array(boundedText(240)).max(5),
    overallSummary: boundedText(1_000),
    requirements: z.array(providerRequirementSchema).min(1).max(24),
  })
  .strict();

export type ResumeJDDifferenceProviderOutput = z.infer<
  typeof resumeJDDifferenceProviderOutputSchema
>;

type ProviderRequirement = ResumeJDDifferenceProviderOutput["requirements"][number];

const KINDS = ["core", "gate", "preferred"] as const;
const COMPARISON_MODES = ["semantic", "strict"] as const;
const ASSESSMENTS = [
  "matched",
  "partial",
  "missing",
  "profile_only",
  "needs_confirmation",
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T | null,
) {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function clampTextArray(value: unknown, max: number, limit: number) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const text = clampText(entry, max);
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function repairImprovement(value: unknown) {
  const raw = asRecord(value);
  if (!raw) return null;
  const direction = clampText(raw.direction, 800);
  if (!direction) return null;
  return {
    targetSection: oneOf(
      raw.targetSection,
      resumeTargetSectionSchema.options,
      "other",
    ),
    targetExperience: clampText(raw.targetExperience, 300) ?? null,
    focusAreas: (Array.isArray(raw.focusAreas) ? raw.focusAreas : [])
      .map((entry) => oneOf(entry, improvementFocusAreaSchema.options, null))
      .filter((entry): entry is (typeof improvementFocusAreaSchema.options)[number] =>
        entry !== null,
      )
      .slice(0, 6),
    synonymousJobLanguage: clampTextArray(raw.synonymousJobLanguage, 160, 12),
    needsConfirmation: raw.needsConfirmation !== false,
    direction,
  };
}

function repairRequirement(value: unknown, copy: DifferenceOutputCopy) {
  const raw = asRecord(value);
  if (!raw) return null;
  const jdSegmentId = clampText(raw.jdSegmentId, 32);
  if (!jdSegmentId) return null;
  const resumeSegmentId = clampText(raw.resumeSegmentId, 32) ?? null;
  return {
    jdSegmentId,
    kind: oneOf(raw.kind, KINDS, "core"),
    comparisonMode: oneOf(raw.comparisonMode, COMPARISON_MODES, "strict"),
    conceptLabel: clampText(raw.conceptLabel, 160) ?? copy.fallbacks.conceptLabel,
    jdTerms: clampTextArray(raw.jdTerms, 160, 12),
    importanceReason:
      clampText(raw.importanceReason, 600) ?? copy.fallbacks.importanceReason,
    priority: oneOf(raw.priority, differencePrioritySchema.options, "important"),
    translation:
      clampText(raw.translation, 1_500) ?? copy.fallbacks.translation,
    assessment: oneOf(raw.assessment, ASSESSMENTS, "needs_confirmation"),
    resumeSegmentId,
    profileFactIds: (Array.isArray(raw.profileFactIds) ? raw.profileFactIds : [])
      .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))
      .slice(0, 12),
    gapType: oneOf(raw.gapType, differenceIssueTypeSchema.options, null),
    resumeStatus: clampText(raw.resumeStatus, 800) ?? copy.noEvidence,
    problem: clampText(raw.problem, 800) ?? null,
    reason: clampText(raw.reason, 1_000) ?? copy.fallbacks.reason,
    improvement: repairImprovement(raw.improvement),
  };
}

export function repairProviderOutput(
  value: unknown,
  copy: DifferenceOutputCopy,
): unknown {
  const raw = asRecord(value);
  if (!raw) return value;
  const requirements = (Array.isArray(raw.requirements) ? raw.requirements : [])
    .map((entry) => repairRequirement(entry, copy))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, 24);
  return {
    mission: clampText(raw.mission, 800) ?? copy.fallbacks.mission,
    coreCapabilities: clampTextArray(raw.coreCapabilities, 240, 5),
    overallSummary:
      clampText(raw.overallSummary, 1_000) ?? copy.fallbacks.overallSummary,
    requirements,
  };
}

function boundedSegments(value: string) {
  const segments: string[] = [];
  let remaining = value.trim();
  while (remaining.length > SEGMENT_MAX_LENGTH) {
    const wordBoundary = remaining.lastIndexOf(" ", SEGMENT_MAX_LENGTH);
    const end =
      wordBoundary >= Math.floor(SEGMENT_MAX_LENGTH / 2)
        ? wordBoundary
        : SEGMENT_MAX_LENGTH;
    const segment = remaining.slice(0, end).trim();
    if (segment) segments.push(segment);
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) segments.push(remaining);
  return segments;
}

export function buildSourceSegments(
  document: string,
  prefix: "jd" | "resume",
): DifferenceSourceSegment[] {
  const texts: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string) => {
    for (const segment of boundedSegments(candidate)) {
      if (seen.has(segment)) continue;
      seen.add(segment);
      texts.push(segment);
    }
  };

  for (const rawLine of document.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const sentences =
      line.match(/[^.!?。！？;；]+(?:[.!?。！？;；]+|$)/gu) ?? [];
    if (sentences.length > 1) {
      for (const sentence of sentences) add(sentence.trim());
    } else {
      add(line);
    }
  }

  return texts.map((text, index) => ({ id: `${prefix}-${index + 1}`, text }));
}

function boundedDerivedTerm(sourceExcerpt: string) {
  if (sourceExcerpt.length <= 160) return sourceExcerpt;
  const wordBoundary = sourceExcerpt.lastIndexOf(" ", 160);
  const end = wordBoundary >= 80 ? wordBoundary : 160;
  return sourceExcerpt.slice(0, end).trim();
}

function resolveAuthenticity(input: {
  assessment: ProviderRequirement["assessment"];
  resumeExcerpt: string | null;
  profileFactIds: string[];
}): DifferenceAuthenticity {
  if (input.assessment === "missing") return "unsupported";
  if (input.assessment === "needs_confirmation") return "needs_confirmation";
  if (input.assessment === "profile_only") {
    return input.profileFactIds.length > 0 ? "profile_only" : "unsupported";
  }
  if (input.resumeExcerpt) return "supported";
  return input.profileFactIds.length > 0 ? "profile_only" : "unsupported";
}

function resolveIssueType(input: {
  isGate: boolean;
  authenticity: DifferenceAuthenticity;
  gapType: DifferenceIssueType | null;
}): DifferenceIssueType {
  if (input.isGate) return "gate";
  if (input.authenticity === "profile_only") return "profile_only";
  if (input.authenticity === "unsupported") return "missing";
  if (input.authenticity === "needs_confirmation") return "needs_confirmation";
  if (!input.gapType || input.gapType === "gate") return "missing";
  return input.gapType;
}

const priorityRank = { critical: 0, important: 1, minor: 2 } as const;

export function materializeResumeJDDifferenceOutput(
  compact: ResumeJDDifferenceProviderOutput,
  context: {
    jdSegments: DifferenceSourceSegment[];
    resumeSegments: DifferenceSourceSegment[];
    confirmedFactIds: ReadonlySet<string>;
    copy: DifferenceOutputCopy;
  },
): ResumeJDDifferenceOutput {
  const jdById = new Map(context.jdSegments.map((item) => [item.id, item.text]));
  const resumeById = new Map(
    context.resumeSegments.map((item) => [item.id, item.text]),
  );

  const concepts: ResumeJDDifferenceOutput["jobCore"]["concepts"] = [];
  const gates: ResumeJDDifferenceOutput["jobCore"]["gates"] = [];
  const preferredItems: ResumeJDDifferenceOutput["jobCore"]["preferredItems"] = [];
  const issues: ResumeJDDifferenceOutput["issues"] = [];
  const matched: ResumeJDDifferenceOutput["matched"] = [];
  const directions: ResumeJDDifferenceOutput["directions"] = [];

  for (const item of compact.requirements) {
    const jdOriginal = jdById.get(item.jdSegmentId);
    if (!jdOriginal) throw new Error("resume-jd-difference-reference-invalid");
    if (item.resumeSegmentId && !resumeById.has(item.resumeSegmentId)) {
      throw new Error("resume-jd-difference-reference-invalid");
    }

    const conceptId = `concept-${concepts.length + 1}`;
    const exactTerms = [
      ...new Set(item.jdTerms.filter((term) => jdOriginal.includes(term))),
    ];
    const sourceTerms = exactTerms.length
      ? exactTerms
      : [boundedDerivedTerm(jdOriginal)];
    concepts.push({
      id: conceptId,
      label: item.conceptLabel,
      originalTerms: sourceTerms,
      importanceReason: item.importanceReason,
      priority: item.priority,
    });

    const isGate = item.kind === "gate";
    if (isGate && gates.length < MAX_GATES) {
      gates.push({
        id: `gate-${gates.length + 1}`,
        originalText: jdOriginal,
        translation: item.translation,
        reason: item.importanceReason,
      });
    }
    if (
      item.kind === "preferred" &&
      preferredItems.length < MAX_PREFERRED_ITEMS
    ) {
      preferredItems.push({
        id: `preferred-${preferredItems.length + 1}`,
        originalText: jdOriginal,
        translation: item.translation,
        reason: item.importanceReason,
      });
    }

    const resumeExcerpt = item.resumeSegmentId
      ? resumeById.get(item.resumeSegmentId) ?? null
      : null;
    const profileFactIds = [
      ...new Set(
        item.profileFactIds.filter((id) => context.confirmedFactIds.has(id)),
      ),
    ];
    const authenticity = resolveAuthenticity({
      assessment: item.assessment,
      resumeExcerpt,
      profileFactIds,
    });

    if (!isGate && item.assessment === "matched" && resumeExcerpt) {
      matched.push({
        id: `matched-${matched.length + 1}`,
        conceptId,
        jdOriginal,
        jdTranslation: item.translation,
        resumeExcerpt,
        profileFactIds,
        reason: item.reason,
      });
      continue;
    }

    const issueId = `issue-${issues.length + 1}`;
    issues.push({
      id: issueId,
      conceptId,
      jdOriginal,
      jdTranslation: item.translation,
      resumeExcerpt,
      resumeStatus:
        authenticity === "unsupported"
          ? context.copy.noEvidence
          : authenticity === "profile_only"
            ? context.copy.profileOnlyStatus
            : item.resumeStatus,
      profileFactIds,
      type: resolveIssueType({ isGate, authenticity, gapType: item.gapType }),
      problem: item.problem ?? context.copy.fallbacks.problem,
      reason: item.reason,
      priority: item.priority,
      isGate,
      authenticity,
    });

    if (isGate) continue;

    const guidance = item.improvement;
    directions.push({
      id: `direction-${directions.length + 1}`,
      issueId,
      targetSection: guidance?.targetSection ?? "other",
      targetExperience: guidance?.targetExperience ?? null,
      conceptId,
      jdTerms: sourceTerms,
      focusAreas: guidance?.focusAreas ?? [],
      synonymousJobLanguage:
        authenticity === "unsupported"
          ? []
          : guidance?.synonymousJobLanguage ?? [],
      authenticity,
      needsConfirmation:
        authenticity !== "supported" || (guidance?.needsConfirmation ?? true),
      direction: guidance?.direction ?? context.copy.fallbacks.direction,
    });
  }

  const topIssueIds = issues
    .filter((item) => !item.isGate)
    .toSorted(
      (left, right) => priorityRank[left.priority] - priorityRank[right.priority],
    )
    .slice(0, 3)
    .map(({ id }) => id);

  return resumeJDDifferenceOutputSchema.parse({
    jobCore: {
      mission: compact.mission,
      coreCapabilities: compact.coreCapabilities,
      concepts,
      gates,
      preferredItems,
    },
    overallDifference: {
      summary: compact.overallSummary,
      topIssueIds,
    },
    issues,
    matched,
    directions,
  });
}
