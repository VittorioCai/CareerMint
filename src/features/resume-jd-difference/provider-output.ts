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

const NO_EVIDENCE = "当前材料未找到相关证据";
const sourceSegmentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^(?:jd|resume)-[1-9][0-9]*$/u);
const boundedText = (max: number) => z.string().trim().min(1).max(max);

export type DifferenceSourceSegment = {
  id: string;
  text: string;
};

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
    jdTerms: z.array(boundedText(160)).min(1).max(12),
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
    coreCapabilities: z.array(boundedText(240)).min(3).max(5),
    overallSummaryZh: boundedText(1_000),
    requirements: z.array(providerRequirementSchema).min(1).max(24),
  })
  .strict();

export type ResumeJDDifferenceProviderOutput = z.infer<
  typeof resumeJDDifferenceProviderOutputSchema
>;

function boundedExactSegments(value: string, maxLength: number) {
  const segments: string[] = [];
  let remaining = value.trim();
  while (remaining.length > maxLength) {
    const wordBoundary = remaining.lastIndexOf(" ", maxLength);
    const end = wordBoundary >= Math.floor(maxLength / 2)
      ? wordBoundary
      : maxLength;
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
  const exactSegments: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string) => {
    for (const segment of boundedExactSegments(candidate, 1_000)) {
      if (!segment || seen.has(segment)) continue;
      seen.add(segment);
      exactSegments.push(segment);
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

  return exactSegments.map((text, index) => ({
    id: `${prefix}-${index + 1}`,
    text,
  }));
}

function boundedDerivedTerm(sourceExcerpt: string) {
  if (sourceExcerpt.length <= 160) return sourceExcerpt;
  const wordBoundary = sourceExcerpt.lastIndexOf(" ", 160);
  const end = wordBoundary >= 80 ? wordBoundary : 160;
  return sourceExcerpt.slice(0, end).trim();
}

function issueType(input: {
  kind: "core" | "gate" | "preferred";
  assessment: ResumeJDDifferenceProviderOutput["requirements"][number]["assessment"];
  gapType: DifferenceIssueType | null;
}): DifferenceIssueType {
  if (input.kind === "gate") return "gate";
  if (input.assessment === "profile_only") return "profile_only";
  if (input.assessment === "needs_confirmation") return "needs_confirmation";
  if (!input.gapType || input.gapType === "gate") return "missing";
  return input.gapType;
}

function authenticity(input: {
  assessment: ResumeJDDifferenceProviderOutput["requirements"][number]["assessment"];
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

function includesAllStrictTerms(excerpt: string | null, terms: string[]) {
  if (!excerpt) return false;
  const normalizedExcerpt = excerpt.normalize("NFKC").toLocaleLowerCase();
  return terms.every((term) =>
    normalizedExcerpt.includes(term.normalize("NFKC").toLocaleLowerCase()),
  );
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
    if (item.kind === "gate") {
      gates.push({
        id: `gate-${gates.length + 1}`,
        originalText: jdOriginal,
        translationZh: item.translationZh,
        reasonZh: item.importanceReasonZh,
      });
    }
    if (item.kind === "preferred") {
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
    const profileFactIds = item.profileFactIds.filter((id) =>
      context.confirmedFactIds.has(id),
    );
    const effectiveAssessment =
      item.assessment === "matched" &&
      item.comparisonMode === "strict" &&
      !includesAllStrictTerms(resumeExcerpt, sourceTerms)
        ? "missing"
        : item.assessment;
    const itemAuthenticity = authenticity({
      assessment: effectiveAssessment,
      resumeExcerpt,
      profileFactIds,
    });
    const canPublishAsMatched =
      effectiveAssessment === "matched" && resumeExcerpt !== null;

    if (canPublishAsMatched) {
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
    const isGate = item.kind === "gate";
    const resolvedType: DifferenceIssueType = isGate
      ? "gate"
      : itemAuthenticity === "profile_only"
        ? "profile_only"
        : itemAuthenticity === "unsupported"
          ? "missing"
          : itemAuthenticity === "needs_confirmation"
            ? "needs_confirmation"
            : issueType({ ...item, assessment: effectiveAssessment });
    issues.push({
      id: issueId,
      conceptId,
      jdOriginal,
      jdTranslationZh: item.translationZh,
      resumeExcerpt,
      resumeStatusZh:
        itemAuthenticity === "unsupported"
          ? NO_EVIDENCE
          : itemAuthenticity === "profile_only"
            ? "职业档案有已确认相关事实，但当前对照简历中未找到可回查的表述。"
            : item.resumeStatusZh,
      profileFactIds,
      type: resolvedType,
      problemZh: item.problemZh ?? "当前简历尚未完整覆盖这项岗位要求。",
      reasonZh: item.reasonZh,
      priority: item.priority,
      isGate,
      authenticity: itemAuthenticity,
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
        itemAuthenticity === "unsupported"
          ? []
          : guidance?.synonymousJobLanguage ?? [],
      authenticity: itemAuthenticity,
      needsConfirmation:
        itemAuthenticity === "unsupported" ||
        itemAuthenticity === "profile_only" ||
        itemAuthenticity === "needs_confirmation" ||
        (guidance?.needsConfirmation ?? true),
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
