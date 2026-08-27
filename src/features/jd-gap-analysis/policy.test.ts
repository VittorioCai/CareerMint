import { describe, expect, it } from "vitest";

import {
  aggregateRequirement,
  applyDeterministicCriterionPolicy,
  canUseSemanticDegreeEquivalence,
  orderGapResults,
} from "./policy";
import type {
  JDGapCriterionAssessment,
  JDGapRequirementForComparison,
} from "./schemas";

const requirementId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function criterion(
  id: string,
  overrides: Partial<JDGapRequirementForComparison["criteria"][number]> = {},
): JDGapRequirementForComparison["criteria"][number] {
  return {
    id,
    groupKey: "g1",
    groupRule: "all",
    kind: "tool",
    originalText: "SQL",
    translationZh: "SQL",
    constraint: { operator: "exact", value: "SQL", unit: null },
    sortOrder: 0,
    ...overrides,
  };
}

function assessment(
  id: string,
  status: JDGapCriterionAssessment["resumeEvidenceStatus"],
  overrides: Partial<JDGapCriterionAssessment> = {},
): JDGapCriterionAssessment {
  return {
    criterionId: id,
    resumeEvidenceStatus: status,
    resumeExcerpt:
      status === "direct" || status === "partial_direct"
        ? "Used SQL for weekly reporting."
        : null,
    profileFactIds: [],
    gapType: status === "direct" ? "none" : "no_supporting_fact",
    reasonZh: "确定性测试理由。",
    userQuestionZh: null,
    ...overrides,
  };
}

function aggregate(input: {
  requirementType?: "required" | "core" | "preferred";
  explicitGate?: boolean;
  criteria: JDGapRequirementForComparison["criteria"];
  assessments: JDGapCriterionAssessment[];
}) {
  return aggregateRequirement({
    requirementId,
    requirementType: input.requirementType ?? "required",
    explicitGate: input.explicitGate ?? false,
    criteria: input.criteria,
    assessments: input.assessments,
    sourceOrder: 0,
  });
}

describe("aggregateRequirement", () => {
  it("requires every all-group and at least one option in each any-group", () => {
    const sql = criterion("11111111-1111-4111-8111-111111111111", {
      groupKey: "g1",
      groupRule: "any",
      originalText: "SQL",
    });
    const python = criterion("22222222-2222-4222-8222-222222222222", {
      groupKey: "g1",
      groupRule: "any",
      originalText: "Python",
      sortOrder: 1,
    });
    const years = criterion("33333333-3333-4333-8333-333333333333", {
      groupKey: "g2",
      groupRule: "all",
      kind: "years_experience",
      originalText: "Three years",
      constraint: { operator: "gte", value: "3", unit: "years" },
      sortOrder: 2,
    });

    expect(
      aggregate({
        criteria: [sql, python, years],
        assessments: [
          assessment(sql.id, "direct"),
          assessment(python.id, "none"),
          assessment(years.id, "direct", { resumeExcerpt: "4 years in analytics" }),
        ],
      }).coverageStatus,
    ).toBe("complete");
    expect(
      aggregate({
        criteria: [sql, python, years],
        assessments: [
          assessment(sql.id, "direct"),
          assessment(python.id, "none"),
          assessment(years.id, "none"),
        ],
      }).coverageStatus,
    ).toBe("partial");
  });

  it("uses confirmation only without resume evidence and ignores profile-only support", () => {
    const first = criterion("11111111-1111-4111-8111-111111111111");
    const second = criterion("22222222-2222-4222-8222-222222222222", {
      groupKey: "g2",
      kind: "work_authorization",
      sortOrder: 1,
    });

    expect(
      aggregate({
        criteria: [first, second],
        assessments: [
          assessment(first.id, "none", {
            profileFactIds: ["44444444-4444-4444-8444-444444444444"],
          }),
          assessment(second.id, "needs_confirmation"),
        ],
      }).coverageStatus,
    ).toBe("needs_confirmation");
    expect(
      aggregate({
        criteria: [first],
        assessments: [
          assessment(first.id, "none", {
            profileFactIds: ["44444444-4444-4444-8444-444444444444"],
          }),
        ],
      }).coverageStatus,
    ).toBe("none");
  });

  it("assigns impact independently from coverage", () => {
    const first = criterion("11111111-1111-4111-8111-111111111111");

    expect(
      aggregate({
        requirementType: "preferred",
        explicitGate: true,
        criteria: [first],
        assessments: [assessment(first.id, "none")],
      }).impactLevel,
    ).toBe("minor");
    expect(
      aggregate({
        explicitGate: true,
        criteria: [first],
        assessments: [assessment(first.id, "none")],
      }).impactLevel,
    ).toBe("blocking");
    expect(
      aggregate({
        criteria: [first],
        assessments: [assessment(first.id, "none")],
      }).impactLevel,
    ).toBe("important");
  });
});

describe("category policy", () => {
  it("permits semantic degree equivalence only when the JD explicitly allows it", () => {
    const degreeField = criterion("11111111-1111-4111-8111-111111111111", {
      kind: "degree_field",
      constraint: { operator: "equivalent_allowed", value: "Business Informatics", unit: null },
    });

    expect(canUseSemanticDegreeEquivalence({ allowsEquivalent: true }, degreeField)).toBe(true);
    expect(canUseSemanticDegreeEquivalence({ allowsEquivalent: false }, degreeField)).toBe(false);
  });

  it("caps a numeric years shortfall and a missing requested metric at partial", () => {
    const years = criterion("11111111-1111-4111-8111-111111111111", {
      kind: "years_experience",
      constraint: { operator: "gte", value: "5", unit: "years" },
    });
    const metric = criterion("22222222-2222-4222-8222-222222222222", {
      kind: "quantified_outcome",
      constraint: { operator: "none", value: null, unit: null },
    });

    expect(
      applyDeterministicCriterionPolicy({
        requirement: { allowsEquivalent: false },
        criterion: years,
        assessment: assessment(years.id, "direct", {
          resumeExcerpt: "Three years of analytics experience",
        }),
      }).resumeEvidenceStatus,
    ).toBe("partial_direct");
    expect(
      applyDeterministicCriterionPolicy({
        requirement: { allowsEquivalent: false },
        criterion: metric,
        assessment: assessment(metric.id, "direct", {
          resumeExcerpt: "Improved the reporting process for stakeholders",
        }),
      }).resumeEvidenceStatus,
    ).toBe("partial_direct");
  });

  it("keeps authorization unconfirmed or a resume omission without dual evidence", () => {
    const authorization = criterion("11111111-1111-4111-8111-111111111111", {
      kind: "work_authorization",
    });

    expect(
      applyDeterministicCriterionPolicy({
        requirement: { allowsEquivalent: false },
        criterion: authorization,
        assessment: assessment(authorization.id, "direct", {
          resumeExcerpt: "Authorized to work in Germany",
        }),
        hasConfirmedAuthorizationFact: false,
      }).resumeEvidenceStatus,
    ).toBe("needs_confirmation");
    expect(
      applyDeterministicCriterionPolicy({
        requirement: { allowsEquivalent: false },
        criterion: authorization,
        assessment: assessment(authorization.id, "none", {
          profileFactIds: ["44444444-4444-4444-8444-444444444444"],
          gapType: "missing_from_resume",
        }),
        hasConfirmedAuthorizationFact: true,
      }).resumeEvidenceStatus,
    ).toBe("none");
  });
});

describe("orderGapResults", () => {
  it("sorts incomplete rows by impact, coverage, and source order, then complete rows", () => {
    const ordered = orderGapResults([
      { requirementId: "complete-blocking", coverageStatus: "complete", impactLevel: "blocking", sourceOrder: 0 },
      { requirementId: "minor-partial", coverageStatus: "partial", impactLevel: "minor", sourceOrder: 1 },
      { requirementId: "important-partial", coverageStatus: "partial", impactLevel: "important", sourceOrder: 2 },
      { requirementId: "important-none-late", coverageStatus: "none", impactLevel: "important", sourceOrder: 4 },
      { requirementId: "blocking-confirm", coverageStatus: "needs_confirmation", impactLevel: "blocking", sourceOrder: 3 },
      { requirementId: "blocking-none", coverageStatus: "none", impactLevel: "blocking", sourceOrder: 5 },
      { requirementId: "important-none-early", coverageStatus: "none", impactLevel: "important", sourceOrder: 0 },
    ]);

    expect(ordered.map((item) => item.requirementId)).toEqual([
      "blocking-none",
      "blocking-confirm",
      "important-none-early",
      "important-none-late",
      "important-partial",
      "minor-partial",
      "complete-blocking",
    ]);
  });
});
