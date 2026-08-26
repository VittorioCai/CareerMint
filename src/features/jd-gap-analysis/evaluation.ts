import { createHash } from "node:crypto";

import { z } from "zod";

import { normalizeForMatching } from "@/features/extraction/evidence";
import { confirmedFactForAnalysisSchema } from "@/features/jd-analysis/schemas";

import type {
  CoverageStatus,
  CriterionEvidenceStatus,
  CriterionGroupRule,
  GapType,
  ImpactLevel,
  JDGapRequirementForComparison,
  JDStructureProviderOutput,
  RequirementType,
} from "./schemas";
import type { ComparisonPromptVariant } from "./prompts";

export const JD_GAP_EVAL_MAX_CALLS = 30;
export const JD_GAP_EVAL_MAX_COST_USD = 2;
export const JD_GAP_EVAL_MAX_OUTPUT_TOKENS = 4096;

const fixtureExpectedCriterionSchema = z
  .object({
    criterionKey: z.string().regex(/^c[1-9][0-9]{0,2}$/u),
    expectedStatus: z.enum([
      "direct",
      "partial_direct",
      "none",
      "needs_confirmation",
    ]),
  })
  .strict();

export const evaluationFixtureSchema = z
  .object({
    caseId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/u),
    jdText: z.string().trim().min(20).max(20_000),
    resumeText: z.string().trim().min(20).max(20_000),
    confirmedFacts: z.array(confirmedFactForAnalysisSchema).max(20),
    confirmedAuthorizationFactIds: z.array(z.uuid()).max(5),
    expected: z
      .object({
        minimumRequirementCount: z.number().int().min(1).max(80),
        criteria: z.array(fixtureExpectedCriterionSchema).min(1).max(960),
      })
      .strict(),
  })
  .strict()
  .superRefine((fixture, context) => {
    const factIds = new Set(fixture.confirmedFacts.map((fact) => fact.id));
    fixture.confirmedAuthorizationFactIds.forEach((factId, index) => {
      if (!factIds.has(factId)) {
        context.addIssue({
          code: "custom",
          path: ["confirmedAuthorizationFactIds", index],
          message: "Authorization facts must be present in confirmedFacts.",
        });
      }
    });
    const criterionKeys = fixture.expected.criteria.map(
      (criterion) => criterion.criterionKey,
    );
    if (new Set(criterionKeys).size !== criterionKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["expected", "criteria"],
        message: "Expected criterion keys must be unique.",
      });
    }
    if (Buffer.byteLength(JSON.stringify(fixture), "utf8") >= 30_000) {
      context.addIssue({
        code: "custom",
        message: "A complete evaluation fixture must be smaller than 30,000 bytes.",
      });
    }
  });

export type EvaluationFixture = z.infer<typeof evaluationFixtureSchema>;

const fixtureUuidNamespace = "44a60d9f-6c90-5c28-94b4-e450b7e6201f";

function uuidBytes(uuid: string) {
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

function uuidV5(name: string) {
  const digest = createHash("sha1")
    .update(uuidBytes(fixtureUuidNamespace))
    .update(name, "utf8")
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function mapFixtureStructureToComparison(
  caseId: string,
  structure: JDStructureProviderOutput,
): JDGapRequirementForComparison[] {
  return structure.requirements.map((requirement, requirementIndex) => {
    const { key: requirementKey, criteria, ...requirementFields } = requirement;
    const requirementId = uuidV5(
      `${caseId}:requirement:${requirementKey}`,
    );
    return {
      ...requirementFields,
      id: requirementId,
      sortOrder: requirementIndex,
      criteria: criteria.map((criterion, criterionIndex) => {
        const { key: criterionKey, ...criterionFields } = criterion;
        return {
          ...criterionFields,
          id: uuidV5(`${caseId}:criterion:${criterionKey}`),
          sortOrder: criterionIndex,
        };
      }),
    };
  });
}

export type EvaluationCriterion = {
  criterionId: string;
  requirementId: string;
  requirementType: RequirementType;
  groupKey: string;
  groupRule: CriterionGroupRule;
  expectedStatus: CriterionEvidenceStatus;
};

export type EvaluationAssessment = {
  criterionId: string;
  resumeEvidenceStatus: CriterionEvidenceStatus;
  resumeExcerpt: string | null;
  profileFactIds: string[];
  gapType: GapType;
  reasonZh: string;
  userQuestionZh: string | null;
};

export type EvaluationRequirementResult = {
  requirementId: string;
  requirementType: RequirementType;
  coverageStatus: CoverageStatus;
  impactLevel: ImpactLevel;
};

export type PromptCaseEvaluationInput = {
  caseId: string;
  resumeText: string;
  criteria: EvaluationCriterion[];
  assessments: EvaluationAssessment[];
  requirementResults: EvaluationRequirementResult[];
};

export type PromptCaseScore = {
  caseId: string;
  hardGateFailures: string[];
  falsePositiveCount: number;
  falseNegativeCount: number;
  requirementRecall: number;
  gapExplanationScore: number;
  weightedScore: number;
};

function uniqueFailures(failures: string[]) {
  return [...new Set(failures)];
}

function criterionSetIsExact(input: PromptCaseEvaluationInput) {
  const expected = input.criteria.map((criterion) => criterion.criterionId);
  const actual = input.assessments.map((assessment) => assessment.criterionId);
  return (
    new Set(expected).size === expected.length &&
    new Set(actual).size === actual.length &&
    expected.length === actual.length &&
    expected.every((criterionId) => actual.includes(criterionId))
  );
}

function hasGroundedResumeQuote(resumeText: string, assessment: EvaluationAssessment) {
  if (!assessment.resumeExcerpt) return false;
  const normalizedQuote = normalizeForMatching(assessment.resumeExcerpt);
  return (
    normalizedQuote.length > 0 &&
    normalizeForMatching(resumeText).includes(normalizedQuote)
  );
}

function groupIsComplete(
  rule: CriterionGroupRule,
  statuses: CriterionEvidenceStatus[],
) {
  return rule === "all"
    ? statuses.length > 0 && statuses.every((status) => status === "direct")
    : statuses.some((status) => status === "direct");
}

function resultClaimsIncompleteGroupAsComplete(input: PromptCaseEvaluationInput) {
  const assessmentById = new Map(
    input.assessments.map((assessment) => [assessment.criterionId, assessment]),
  );

  return input.requirementResults.some((result) => {
    if (result.coverageStatus !== "complete") return false;
    const requirementCriteria = input.criteria.filter(
      (criterion) => criterion.requirementId === result.requirementId,
    );
    const groups = new Map<
      string,
      { rule: CriterionGroupRule; statuses: CriterionEvidenceStatus[] }
    >();
    for (const criterion of requirementCriteria) {
      const assessment = assessmentById.get(criterion.criterionId);
      const group = groups.get(criterion.groupKey) ?? {
        rule: criterion.groupRule,
        statuses: [],
      };
      group.statuses.push(assessment?.resumeEvidenceStatus ?? "none");
      groups.set(criterion.groupKey, group);
    }
    return (
      groups.size === 0 ||
      [...groups.values()].some(
        (group) => !groupIsComplete(group.rule, group.statuses),
      )
    );
  });
}

function isPositiveStatus(status: CriterionEvidenceStatus) {
  return status === "direct" || status === "partial_direct";
}

export function evaluatePromptCase(
  input: PromptCaseEvaluationInput,
): PromptCaseScore {
  const failures: string[] = [];
  if (!criterionSetIsExact(input)) failures.push("criterion-set-mismatch");

  for (const assessment of input.assessments) {
    if (!isPositiveStatus(assessment.resumeEvidenceStatus)) continue;
    const grounded = hasGroundedResumeQuote(input.resumeText, assessment);
    if (!grounded) failures.push("invalid-resume-quote");
    if (!grounded && assessment.profileFactIds.length > 0) {
      failures.push("profile-driven-coverage-upgrade");
    }
  }

  if (resultClaimsIncompleteGroupAsComplete(input)) {
    failures.push("complete-with-incomplete-group");
  }
  if (
    input.requirementResults.some(
      (result) =>
        result.requirementType === "preferred" &&
        result.impactLevel === "blocking",
    )
  ) {
    failures.push("preferred-requirement-blocking");
  }

  const assessmentById = new Map(
    input.assessments.map((assessment) => [assessment.criterionId, assessment]),
  );
  let matchingCount = 0;
  let falsePositiveCount = 0;
  let falseNegativeCount = 0;
  for (const criterion of input.criteria) {
    const actual = assessmentById.get(criterion.criterionId);
    if (!actual) continue;
    if (actual.resumeEvidenceStatus === criterion.expectedStatus) {
      matchingCount += 1;
    }
    if (
      !isPositiveStatus(criterion.expectedStatus) &&
      isPositiveStatus(actual.resumeEvidenceStatus)
    ) {
      falsePositiveCount += 1;
    }
    if (
      isPositiveStatus(criterion.expectedStatus) &&
      !isPositiveStatus(actual.resumeEvidenceStatus)
    ) {
      falseNegativeCount += 1;
    }
  }

  const incompleteAssessments = input.assessments.filter(
    (assessment) => assessment.resumeEvidenceStatus !== "direct",
  );
  const explainedCount = incompleteAssessments.filter(
    (assessment) =>
      assessment.reasonZh.trim().length > 0 && assessment.gapType !== "none",
  ).length;
  const gapExplanationScore =
    incompleteAssessments.length === 0
      ? 1
      : explainedCount / incompleteAssessments.length;
  const requirementRecall =
    input.criteria.length === 0
      ? 1
      : input.criteria.filter((criterion) => assessmentById.has(criterion.criterionId))
          .length / input.criteria.length;
  const weightedScore =
    matchingCount * 10 -
    falsePositiveCount * 25 -
    falseNegativeCount * 10 -
    uniqueFailures(failures).length * 100;

  return {
    caseId: input.caseId,
    hardGateFailures: uniqueFailures(failures),
    falsePositiveCount,
    falseNegativeCount,
    requirementRecall,
    gapExplanationScore,
    weightedScore,
  };
}

export type PromptCandidateSummary = {
  variant: ComparisonPromptVariant;
  promptVersion: string;
  hardGateFailures: string[];
  falsePositiveCount: number;
  requirementRecall: number;
  gapExplanationScore: number;
  stability: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
};

export function selectPromptWinner(
  candidates: readonly PromptCandidateSummary[],
): PromptCandidateSummary {
  const eligible = candidates.filter(
    (candidate) => candidate.hardGateFailures.length === 0,
  );
  if (eligible.length === 0) throw new Error("jd-gap-eval-no-eligible-prompt");

  return [...eligible].sort(
    (left, right) =>
      left.falsePositiveCount - right.falsePositiveCount ||
      right.requirementRecall - left.requirementRecall ||
      right.gapExplanationScore - left.gapExplanationScore ||
      right.stability - left.stability ||
      left.totalTokens - right.totalTokens ||
      left.costUsd - right.costUsd ||
      left.latencyMs - right.latencyMs ||
      left.variant.localeCompare(right.variant),
  )[0];
}

export function createEvaluationBudgetLedger(input: {
  inputCacheMissPerMillion: number;
  outputPerMillion: number;
  maxCalls?: number;
  maxCostUsd?: number;
}) {
  const maxCalls = input.maxCalls ?? JD_GAP_EVAL_MAX_CALLS;
  const maxCostUsd = input.maxCostUsd ?? JD_GAP_EVAL_MAX_COST_USD;
  let callCount = 0;
  let actualCostUsd = 0;

  return {
    reserve(request: { requestBytes: number; maxOutputTokens?: number }) {
      if (callCount >= maxCalls) {
        throw new Error("jd-gap-eval-call-cap-exceeded");
      }
      const maxOutputTokens =
        request.maxOutputTokens ?? JD_GAP_EVAL_MAX_OUTPUT_TOKENS;
      const reservedCostUsd =
        (request.requestBytes * input.inputCacheMissPerMillion +
          maxOutputTokens * input.outputPerMillion) /
        1_000_000;
      if (actualCostUsd + reservedCostUsd > maxCostUsd) {
        throw new Error("jd-gap-eval-cost-cap-exceeded");
      }
      callCount += 1;
      return { callNumber: callCount, reservedCostUsd };
    },
    recordActualCost(amount: number) {
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("jd-gap-eval-invalid-cost");
      }
      actualCostUsd += amount;
      if (actualCostUsd > maxCostUsd) {
        throw new Error("jd-gap-eval-cost-cap-exceeded");
      }
    },
    snapshot() {
      return { callCount, actualCostUsd, maxCalls, maxCostUsd };
    },
  };
}

type UnsafeCaseReport = {
  caseId: string;
  statusCounts: Record<CriterionEvidenceStatus, number>;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  latencyMs: number;
  errors: string[];
  [key: string]: unknown;
};

export function buildSafeEvaluationReport(input: {
  model: string;
  collectedAt: string;
  totalCalls: number;
  totalCostUsd: number;
  winner: ComparisonPromptVariant;
  cases: UnsafeCaseReport[];
}) {
  return {
    model: input.model,
    collectedAt: input.collectedAt,
    totalCalls: input.totalCalls,
    totalCostUsd: input.totalCostUsd,
    winner: input.winner,
    cases: input.cases.map((candidate) => ({
      caseId: candidate.caseId,
      statusCounts: candidate.statusCounts,
      usage: candidate.usage,
      costUsd: candidate.costUsd,
      latencyMs: candidate.latencyMs,
      errors: [...candidate.errors],
    })),
  };
}
