import { normalizeForMatching } from "@/features/extraction/evidence";

import type {
  CriterionEvidenceStatus,
  CriterionGroupRule,
  JDGapCriterionAssessment,
  JDGapCriterionForComparison,
  JDGapRequirementResult,
  RequirementType,
} from "./schemas";

const numberWords = new Map<string, number>([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["ein", 1],
  ["eine", 1],
  ["zwei", 2],
  ["drei", 3],
  ["vier", 4],
  ["fünf", 5],
  ["funf", 5],
  ["sechs", 6],
  ["sieben", 7],
  ["acht", 8],
  ["neun", 9],
  ["zehn", 10],
]);

export function canUseSemanticDegreeEquivalence(
  requirement: Pick<AggregateRequirementInput, "allowsEquivalent">,
  criterion: Pick<JDGapCriterionForComparison, "kind" | "constraint">,
) {
  return (
    requirement.allowsEquivalent === true &&
    criterion.kind === "degree_field" &&
    criterion.constraint.operator === "equivalent_allowed"
  );
}

function extractYears(value: string | null) {
  if (!value) return null;
  const normalized = normalizeForMatching(value);
  const digitMatches = [...normalized.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:years?|jahre?n?)\b/gu)];
  const digits = digitMatches
    .map((match) => Number(match[1]?.replace(",", ".")))
    .filter(Number.isFinite);

  for (const [word, number] of numberWords) {
    const expression = new RegExp(`\\b${word}\\s+(?:years?|jahre?n?)\\b`, "u");
    if (expression.test(normalized)) digits.push(number);
  }

  return digits.length > 0 ? Math.max(...digits) : null;
}

function downgradeDirectAssessment(
  assessment: JDGapCriterionAssessment,
  gapType: JDGapCriterionAssessment["gapType"],
): JDGapCriterionAssessment {
  if (assessment.resumeEvidenceStatus !== "direct") return assessment;
  return {
    ...assessment,
    resumeEvidenceStatus: "partial_direct",
    gapType,
  };
}

export function applyDeterministicCriterionPolicy(input: {
  requirement: { allowsEquivalent?: boolean };
  criterion: JDGapCriterionForComparison;
  assessment: JDGapCriterionAssessment;
  hasConfirmedAuthorizationFact?: boolean;
}): JDGapCriterionAssessment {
  const { criterion } = input;
  let assessment = input.assessment;

  if (
    criterion.kind === "work_authorization" &&
    input.hasConfirmedAuthorizationFact === false
  ) {
    return {
      ...assessment,
      resumeEvidenceStatus: "needs_confirmation",
      resumeExcerpt: null,
      gapType: "language_or_authorization_confirmation",
    };
  }

  if (
    criterion.kind === "years_experience" &&
    criterion.constraint.operator === "gte" &&
    assessment.resumeEvidenceStatus === "direct"
  ) {
    const requiredYears = Number(criterion.constraint.value);
    const evidencedYears = extractYears(assessment.resumeExcerpt);
    if (
      Number.isFinite(requiredYears) &&
      (evidencedYears === null || evidencedYears < requiredYears)
    ) {
      assessment = downgradeDirectAssessment(assessment, "too_vague");
    }
  }

  if (
    criterion.kind === "quantified_outcome" &&
    assessment.resumeEvidenceStatus === "direct" &&
    !/[\d%€$£¥]/u.test(assessment.resumeExcerpt ?? "")
  ) {
    assessment = downgradeDirectAssessment(
      assessment,
      "missing_result_or_number",
    );
  }

  return assessment;
}

type GroupState = "complete" | "partial" | "none" | "needs_confirmation";

function aggregateCriterionGroup(input: {
  rule: CriterionGroupRule;
  statuses: CriterionEvidenceStatus[];
}): GroupState {
  const directCount = input.statuses.filter((status) => status === "direct").length;
  const hasResumeEvidence = input.statuses.some(
    (status) => status === "direct" || status === "partial_direct",
  );

  if (
    (input.rule === "all" && directCount === input.statuses.length) ||
    (input.rule === "any" && directCount > 0)
  ) {
    return "complete";
  }
  if (hasResumeEvidence) return "partial";
  if (input.statuses.some((status) => status === "needs_confirmation")) {
    return "needs_confirmation";
  }
  return "none";
}

export type AggregateRequirementInput = {
  requirementId: string;
  requirementType: RequirementType;
  explicitGate: boolean;
  allowsEquivalent?: boolean;
  criteria: JDGapCriterionForComparison[];
  assessments: JDGapCriterionAssessment[];
  sourceOrder: number;
};

export function aggregateRequirement(
  input: AggregateRequirementInput,
): JDGapRequirementResult {
  const assessmentByCriterion = new Map<string, JDGapCriterionAssessment>();
  for (const assessment of input.assessments) {
    if (assessmentByCriterion.has(assessment.criterionId)) {
      throw new Error("jd-gap-invalid-output");
    }
    assessmentByCriterion.set(assessment.criterionId, assessment);
  }

  const groups = new Map<
    string,
    { rule: CriterionGroupRule; statuses: CriterionEvidenceStatus[] }
  >();
  let coveredCriterionCount = 0;

  for (const criterion of input.criteria) {
    const candidate = assessmentByCriterion.get(criterion.id);
    if (!candidate) throw new Error("jd-gap-invalid-output");
    const assessment = applyDeterministicCriterionPolicy({
      requirement: { allowsEquivalent: input.allowsEquivalent },
      criterion,
      assessment: candidate,
    });
    if (assessment.resumeEvidenceStatus === "direct") {
      coveredCriterionCount += 1;
    }

    const group = groups.get(criterion.groupKey);
    if (group && group.rule !== criterion.groupRule) {
      throw new Error("jd-gap-invalid-output");
    }
    const nextGroup = group ?? { rule: criterion.groupRule, statuses: [] };
    nextGroup.statuses.push(assessment.resumeEvidenceStatus);
    groups.set(criterion.groupKey, nextGroup);
  }

  if (assessmentByCriterion.size !== input.criteria.length || groups.size === 0) {
    throw new Error("jd-gap-invalid-output");
  }

  const groupStates = [...groups.values()].map(aggregateCriterionGroup);
  const hasResumeEvidence = input.assessments.some(
    (criterion) =>
      criterion.resumeEvidenceStatus === "direct" ||
      criterion.resumeEvidenceStatus === "partial_direct",
  );
  const coverageStatus = groupStates.every((state) => state === "complete")
    ? "complete"
    : hasResumeEvidence
      ? "partial"
      : groupStates.some((state) => state === "needs_confirmation")
        ? "needs_confirmation"
        : "none";
  const impactLevel =
    input.requirementType === "preferred"
      ? "minor"
      : input.explicitGate
        ? "blocking"
        : "important";

  return {
    requirementId: input.requirementId,
    coverageStatus,
    impactLevel,
    coveredCriterionCount,
    missingCriterionCount: input.criteria.length - coveredCriterionCount,
    sourceOrder: input.sourceOrder,
  };
}

const impactOrder = { blocking: 0, important: 1, minor: 2 } as const;
const coverageOrder = {
  none: 0,
  needs_confirmation: 1,
  partial: 2,
  complete: 3,
} as const;

export function orderGapResults<
  T extends Pick<
    JDGapRequirementResult,
    "coverageStatus" | "impactLevel" | "sourceOrder"
  >,
>(results: readonly T[]): T[] {
  return [...results].sort((left, right) => {
    const leftComplete = left.coverageStatus === "complete" ? 1 : 0;
    const rightComplete = right.coverageStatus === "complete" ? 1 : 0;
    return (
      leftComplete - rightComplete ||
      impactOrder[left.impactLevel] - impactOrder[right.impactLevel] ||
      coverageOrder[left.coverageStatus] - coverageOrder[right.coverageStatus] ||
      left.sourceOrder - right.sourceOrder
    );
  });
}
