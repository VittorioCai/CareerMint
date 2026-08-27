import {
  normalizeForMatching,
  verifyCandidateEvidence,
} from "@/features/extraction/evidence";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import {
  jdGapComparisonOutputSchema,
  jdStructureProviderOutputSchema,
  type JDGapCriterionAssessment,
  type JDGapRequirementForComparison,
  type JDStructureProviderOutput,
} from "./schemas";

function invalidStructureOutput(): never {
  throw new Error("jd-structure-invalid-output");
}

function invalidGapOutput(): never {
  throw new Error("jd-gap-invalid-output");
}

export function sanitizeJDStructureOutput(input: {
  jdText: string;
  output: unknown;
}): JDStructureProviderOutput {
  const parsed = jdStructureProviderOutputSchema.safeParse(input.output);
  if (!parsed.success || typeof input.jdText !== "string") {
    invalidStructureOutput();
  }

  for (const requirement of parsed.data.requirements) {
    if (!verifyCandidateEvidence(input.jdText, requirement.sourceExcerpt)) {
      invalidStructureOutput();
    }
  }

  return parsed.data;
}

export type SanitizedJDGapComparisonOutput = {
  assessments: JDGapCriterionAssessment[];
  rejectedFactIdCount: number;
  rejectedResumeExcerptCount: number;
};

function listCriteria(requirements: JDGapRequirementForComparison[]) {
  const criteria = new Map<
    string,
    JDGapRequirementForComparison["criteria"][number]
  >();

  for (const requirement of requirements) {
    for (const criterion of requirement.criteria) {
      if (criteria.has(criterion.id)) invalidGapOutput();
      criteria.set(criterion.id, criterion);
    }
  }

  return criteria;
}

function allowlistFactIds(input: {
  factIds: string[];
  confirmedFactIds: Set<string>;
}) {
  const accepted: string[] = [];
  const seen = new Set<string>();
  let rejectedCount = 0;

  for (const factId of input.factIds) {
    if (!input.confirmedFactIds.has(factId)) {
      rejectedCount += 1;
      continue;
    }
    if (seen.has(factId)) continue;
    seen.add(factId);
    accepted.push(factId);
  }

  return { accepted, rejectedCount };
}

export function sanitizeJDGapComparisonOutput(input: {
  resumeText: string;
  requirements: JDGapRequirementForComparison[];
  confirmedFacts: ConfirmedFactForAnalysis[];
  confirmedAuthorizationFactIds?: string[];
  output: unknown;
}): SanitizedJDGapComparisonOutput {
  const parsed = jdGapComparisonOutputSchema.safeParse(input.output);
  if (!parsed.success || typeof input.resumeText !== "string") {
    invalidGapOutput();
  }

  const criteria = listCriteria(input.requirements);
  const confirmedFactIds = new Set(input.confirmedFacts.map((fact) => fact.id));
  const confirmedAuthorizationFactIds = new Set(
    (input.confirmedAuthorizationFactIds ?? []).filter((factId) =>
      confirmedFactIds.has(factId),
    ),
  );
  const byCriterionId = new Map<string, JDGapCriterionAssessment>();
  const normalizedResume = normalizeForMatching(input.resumeText);
  let rejectedFactIdCount = 0;
  let rejectedResumeExcerptCount = 0;

  for (const candidate of parsed.data.assessments) {
    const criterion = criteria.get(candidate.criterionId);
    if (!criterion || byCriterionId.has(candidate.criterionId)) {
      invalidGapOutput();
    }

    const factIds = allowlistFactIds({
      factIds: candidate.profileFactIds,
      confirmedFactIds,
    });
    rejectedFactIdCount += factIds.rejectedCount;

    const hasGroundedExcerpt =
      candidate.resumeExcerpt !== null &&
      normalizeForMatching(candidate.resumeExcerpt).length > 0 &&
      normalizedResume.includes(normalizeForMatching(candidate.resumeExcerpt));
    const claimsResumeEvidence =
      candidate.resumeEvidenceStatus === "direct" ||
      candidate.resumeEvidenceStatus === "partial_direct";

    let sanitized: JDGapCriterionAssessment = {
      ...candidate,
      profileFactIds: factIds.accepted,
      resumeExcerpt: claimsResumeEvidence ? candidate.resumeExcerpt : null,
    };

    if (!claimsResumeEvidence && candidate.resumeExcerpt !== null) {
      rejectedResumeExcerptCount += 1;
    }

    if (claimsResumeEvidence && !hasGroundedExcerpt) {
      rejectedResumeExcerptCount += 1;
      sanitized = {
        ...sanitized,
        resumeEvidenceStatus: "none",
        resumeExcerpt: null,
        gapType:
          factIds.accepted.length > 0
            ? "missing_from_resume"
            : "no_supporting_fact",
      };
    }

    if (criterion.kind === "work_authorization") {
      const hasConfirmedAuthorizationFact = factIds.accepted.some((factId) =>
        confirmedAuthorizationFactIds.has(factId),
      );
      if (!hasConfirmedAuthorizationFact) {
        sanitized = {
          ...sanitized,
          resumeEvidenceStatus: "needs_confirmation",
          resumeExcerpt: null,
          gapType: "language_or_authorization_confirmation",
        };
      }
    }

    byCriterionId.set(candidate.criterionId, sanitized);
  }

  if (byCriterionId.size !== criteria.size) invalidGapOutput();

  const assessments = [...criteria.keys()].map((criterionId) => {
    const assessment = byCriterionId.get(criterionId);
    return assessment ?? invalidGapOutput();
  });

  return {
    assessments,
    rejectedFactIdCount,
    rejectedResumeExcerptCount,
  };
}
