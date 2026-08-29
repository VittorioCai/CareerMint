import { z } from "zod";

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
const NO_EVIDENCE = "当前材料未找到相关证据";
const PROFILE_ONLY_STATUS =
  "职业档案有已确认相关事实，但当前对照简历中未找到可回查的表述。";

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
    targetExperienceZh: boundedText(300).nullable(),
    focusAreas: z.array(improvementFocusAreaSchema).max(6),
    synonymousJobLanguage: z.array(boundedText(160)).max(12),
    needsConfirmation: z.boolean(),
    directionZh: boundedText(800),
  })
  .strict();

const providerRequirementSchema = z
  .object({
    jdSegmentId: sourceSegmentIdSchema,
    kind: z.enum(["core", "gate", "preferred"]),
    comparisonMode: z.enum(["semantic", "strict"]),
    conceptLabelZh: boundedText(160),
    jdTerms: z.array(boundedText(160)).max(12),
    importanceReasonZh: boundedText(600),
    priority: differencePrioritySchema,
    translationZh: boundedText(1_500),
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
    resumeStatusZh: boundedText(800),
    problemZh: boundedText(800).nullable(),
    reasonZh: boundedText(1_000),
    improvement: providerImprovementSchema.nullable(),
  })
  .strict();

export const resumeJDDifferenceProviderOutputSchema = z
  .object({
    missionZh: boundedText(800),
    coreCapabilities: z.array(boundedText(240)).max(5),
    overallSummaryZh: boundedText(1_000),
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
  const directionZh = clampText(raw.directionZh, 800);
  if (!directionZh) return null;
  return {
    targetSection: oneOf(
      raw.targetSection,
      resumeTargetSectionSchema.options,
      "other",
    ),
    targetExperienceZh: clampText(raw.targetExperienceZh, 300) ?? null,
    focusAreas: (Array.isArray(raw.focusAreas) ? raw.focusAreas : [])
      .map((entry) => oneOf(entry, improvementFocusAreaSchema.options, null))
      .filter((entry): entry is (typeof improvementFocusAreaSchema.options)[number] =>
        entry !== null,
      )
      .slice(0, 6),
    synonymousJobLanguage: clampTextArray(raw.synonymousJobLanguage, 160, 12),
    needsConfirmation: raw.needsConfirmation !== false,
    directionZh,
  };
}

function repairRequirement(value: unknown) {
  const raw = asRecord(value);
  if (!raw) return null;
  const jdSegmentId = clampText(raw.jdSegmentId, 32);
  if (!jdSegmentId) return null;
  const resumeSegmentId = clampText(raw.resumeSegmentId, 32) ?? null;
  return {
    jdSegmentId,
    kind: oneOf(raw.kind, KINDS, "core"),
    comparisonMode: oneOf(raw.comparisonMode, COMPARISON_MODES, "strict"),
    conceptLabelZh: clampText(raw.conceptLabelZh, 160) ?? "岗位要求",
    jdTerms: clampTextArray(raw.jdTerms, 160, 12),
    importanceReasonZh: clampText(raw.importanceReasonZh, 600) ?? "岗位描述中的要求。",
    priority: oneOf(raw.priority, differencePrioritySchema.options, "important"),
    translationZh: clampText(raw.translationZh, 1_500) ?? "（暂无中文翻译）",
    assessment: oneOf(raw.assessment, ASSESSMENTS, "needs_confirmation"),
    resumeSegmentId,
    profileFactIds: (Array.isArray(raw.profileFactIds) ? raw.profileFactIds : [])
      .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))
      .slice(0, 12),
    gapType: oneOf(raw.gapType, differenceIssueTypeSchema.options, null),
    resumeStatusZh: clampText(raw.resumeStatusZh, 800) ?? NO_EVIDENCE,
    problemZh: clampText(raw.problemZh, 800) ?? null,
    reasonZh: clampText(raw.reasonZh, 1_000) ?? "依据当前材料判断。",
    improvement: repairImprovement(raw.improvement),
  };
}

export function repairProviderOutput(value: unknown): unknown {
  const raw = asRecord(value);
  if (!raw) return value;
  const requirements = (Array.isArray(raw.requirements) ? raw.requirements : [])
    .map(repairRequirement)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, 24);
  return {
    missionZh: clampText(raw.missionZh, 800) ?? "（暂无岗位使命判断）",
    coreCapabilities: clampTextArray(raw.coreCapabilities, 240, 5),
    overallSummaryZh: clampText(raw.overallSummaryZh, 1_000) ?? "（暂无总体判断）",
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
      labelZh: item.conceptLabelZh,
      originalTerms: sourceTerms,
      importanceReasonZh: item.importanceReasonZh,
      priority: item.priority,
    });

    const isGate = item.kind === "gate";
    if (isGate && gates.length < MAX_GATES) {
      gates.push({
        id: `gate-${gates.length + 1}`,
        originalText: jdOriginal,
        translationZh: item.translationZh,
        reasonZh: item.importanceReasonZh,
      });
    }
    if (
      item.kind === "preferred" &&
      preferredItems.length < MAX_PREFERRED_ITEMS
    ) {
      preferredItems.push({
        id: `preferred-${preferredItems.length + 1}`,
        originalText: jdOriginal,
        translationZh: item.translationZh,
        reasonZh: item.importanceReasonZh,
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
        jdTranslationZh: item.translationZh,
        resumeExcerpt,
        profileFactIds,
        reasonZh: item.reasonZh,
      });
      continue;
    }

    const issueId = `issue-${issues.length + 1}`;
    issues.push({
      id: issueId,
      conceptId,
      jdOriginal,
      jdTranslationZh: item.translationZh,
      resumeExcerpt,
      resumeStatusZh:
        authenticity === "unsupported"
          ? NO_EVIDENCE
          : authenticity === "profile_only"
            ? PROFILE_ONLY_STATUS
            : item.resumeStatusZh,
      profileFactIds,
      type: resolveIssueType({ isGate, authenticity, gapType: item.gapType }),
      problemZh: item.problemZh ?? "当前简历尚未完整覆盖这项岗位要求。",
      reasonZh: item.reasonZh,
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
      targetExperienceZh: guidance?.targetExperienceZh ?? null,
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
      directionZh:
        guidance?.directionZh ??
        "先核对是否有相关真实经历；有则补充可回查的动作、场景和结果，没有则不要加入简历。",
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
      missionZh: compact.missionZh,
      coreCapabilities: compact.coreCapabilities,
      concepts,
      gates,
      preferredItems,
    },
    overallDifference: {
      summaryZh: compact.overallSummaryZh,
      topIssueIds,
    },
    issues,
    matched,
    directions,
  });
}
