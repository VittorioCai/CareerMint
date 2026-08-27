import { describe, expect, it } from "vitest";

import {
  coverageStatusSchema,
  criterionEvidenceStatusSchema,
  criterionGroupRuleSchema,
  criterionKindSchema,
  gapTypeSchema,
  impactLevelSchema,
  jdGapComparisonOutputSchema,
  jdStructureProviderOutputSchema,
  requirementTypeSchema,
} from "./schemas";

const criterionKinds = [
  "degree_level",
  "degree_field",
  "years_experience",
  "language",
  "work_authorization",
  "certification",
  "tool",
  "responsibility",
  "industry",
  "soft_skill",
  "quantified_outcome",
  "other",
] as const;

function criterion(index = 1) {
  return {
    key: `c${index}`,
    groupKey: "g1",
    groupRule: "all" as const,
    kind: "years_experience" as const,
    originalText: "At least three years of professional experience",
    translationZh: "至少三年相关工作经验",
    constraint: {
      operator: "gte" as const,
      value: "3",
      unit: "years",
    },
  };
}

function requirement(index = 1) {
  return {
    key: `r${index}`,
    category: "hard_requirement" as const,
    requirementType: "required" as const,
    originalText: "At least three years of professional experience",
    translationZh: "至少三年相关工作经验",
    sourceExcerpt: "At least three years of professional experience",
    allowsEquivalent: false,
    explicitGate: true,
    criteria: [criterion(index)],
  };
}

describe("JD gap V3 enums", () => {
  it("accepts every bounded domain value", () => {
    expect(criterionKinds.map((value) => criterionKindSchema.parse(value))).toEqual(
      criterionKinds,
    );
    expect(requirementTypeSchema.options).toEqual(["required", "core", "preferred"]);
    expect(criterionGroupRuleSchema.options).toEqual(["all", "any"]);
    expect(criterionEvidenceStatusSchema.options).toEqual([
      "direct",
      "partial_direct",
      "none",
      "needs_confirmation",
    ]);
    expect(coverageStatusSchema.options).toEqual([
      "complete",
      "partial",
      "none",
      "needs_confirmation",
    ]);
    expect(impactLevelSchema.options).toEqual(["blocking", "important", "minor"]);
    expect(gapTypeSchema.options).toEqual([
      "missing_from_resume",
      "too_vague",
      "missing_result_or_number",
      "no_supporting_fact",
      "language_or_authorization_confirmation",
      "none",
    ]);
  });
});

describe("jdStructureProviderOutputSchema", () => {
  it("accepts strict atomic requirements and grouped all/any criteria", () => {
    const valid = {
      jdTranslationZh: "岗位要求至少三年经验，并熟练使用 SQL 或 Python。",
      requirements: [
        {
          ...requirement(),
          criteria: [
            criterion(),
            {
              ...criterion(2),
              groupKey: "g2",
              groupRule: "any" as const,
              kind: "tool" as const,
              originalText: "SQL",
              translationZh: "SQL",
              constraint: { operator: "one_of" as const, value: "SQL|Python", unit: null },
            },
          ],
        },
      ],
    };

    expect(jdStructureProviderOutputSchema.parse(valid)).toEqual(valid);
    expect(
      jdStructureProviderOutputSchema.safeParse({ ...valid, providerComment: "match" })
        .success,
    ).toBe(false);
    expect(
      jdStructureProviderOutputSchema.safeParse({
        ...valid,
        requirements: [{ ...valid.requirements[0], resumeMatch: "complete" }],
      }).success,
    ).toBe(false);
  });

  it("enforces requirement, criterion, key, and Unicode text bounds", () => {
    const base = {
      jdTranslationZh: "完整中文翻译",
      requirements: [requirement()],
    };

    expect(
      jdStructureProviderOutputSchema.safeParse({
        ...base,
        requirements: Array.from({ length: 81 }, (_, index) => requirement(index + 1)),
      }).success,
    ).toBe(false);
    expect(
      jdStructureProviderOutputSchema.safeParse({
        ...base,
        requirements: [
          {
            ...requirement(),
            criteria: Array.from({ length: 13 }, (_, index) => criterion(index + 1)),
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      jdStructureProviderOutputSchema.safeParse({
        ...base,
        requirements: [requirement(), { ...requirement(2), key: "r1" }],
      }).success,
    ).toBe(false);
    expect(
      jdStructureProviderOutputSchema.safeParse({
        ...base,
        requirements: [
          {
            ...requirement(),
            criteria: [criterion(), { ...criterion(2), key: "c1" }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      jdStructureProviderOutputSchema.safeParse({
        ...base,
        requirements: [{ ...requirement(), criteria: [] }],
      }).success,
    ).toBe(false);
    expect(
      jdStructureProviderOutputSchema.safeParse({
        ...base,
        requirements: [{ ...requirement(), originalText: "😀".repeat(501) }],
      }).success,
    ).toBe(false);
  });

  it("accepts every criterion kind with a strict constraint object", () => {
    const output = {
      jdTranslationZh: "完整中文翻译",
      requirements: [
        {
          ...requirement(),
          criteria: criterionKinds.map((kind, index) => ({
            ...criterion(index + 1),
            key: `c${index + 1}`,
            kind,
            constraint: { operator: "none" as const, value: null, unit: null },
          })),
        },
      ],
    };

    expect(jdStructureProviderOutputSchema.safeParse(output).success).toBe(true);
    expect(
      jdStructureProviderOutputSchema.safeParse({
        ...output,
        requirements: [
          {
            ...output.requirements[0],
            criteria: [
              {
                ...output.requirements[0].criteria[0],
                constraint: { operator: "none", value: null, unit: null, extra: true },
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("jdGapComparisonOutputSchema", () => {
  it("accepts a strict, bounded criterion assessment envelope", () => {
    const valid = {
      assessments: [
        {
          criterionId: "11111111-1111-4111-8111-111111111111",
          resumeEvidenceStatus: "partial_direct" as const,
          resumeExcerpt: "Built weekly SQL reports for commercial leaders.",
          profileFactIds: ["22222222-2222-4222-8222-222222222222"],
          gapType: "missing_result_or_number" as const,
          reasonZh: "简历证明了相关工作，但没有量化业务结果。",
          userQuestionZh: "是否有可补充的效率或业务指标？",
        },
      ],
    };

    expect(jdGapComparisonOutputSchema.parse(valid)).toEqual(valid);
    expect(
      jdGapComparisonOutputSchema.safeParse({ ...valid, summary: "looks good" }).success,
    ).toBe(false);
    expect(
      jdGapComparisonOutputSchema.safeParse({
        assessments: [{ ...valid.assessments[0], reasonZh: "理".repeat(701) }],
      }).success,
    ).toBe(false);
    expect(
      jdGapComparisonOutputSchema.safeParse({
        assessments: [{ ...valid.assessments[0], extra: "suggestion" }],
      }).success,
    ).toBe(false);
  });
});
