import { describe, expect, it } from "vitest";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import {
  sanitizeJDGapComparisonOutput,
  sanitizeJDStructureOutput,
} from "./sanitizers";
import type { JDGapRequirementForComparison } from "./schemas";

const criterionIdA = "11111111-1111-4111-8111-111111111111";
const criterionIdB = "22222222-2222-4222-8222-222222222222";
const authorizationCriterionId = "33333333-3333-4333-8333-333333333333";
const confirmedFactId = "44444444-4444-4444-8444-444444444444";
const authorizationFactId = "55555555-5555-4555-8555-555555555555";
const foreignFactId = "99999999-9999-4999-8999-999999999999";

function structureRequirement(index = 1) {
  return {
    key: `r${index}`,
    category: "hard_requirement" as const,
    requirementType: "required" as const,
    originalText: "At least three years of professional experience",
    translationZh: "至少三年相关工作经验",
    sourceExcerpt: "At least three years of professional experience",
    allowsEquivalent: false,
    explicitGate: true,
    criteria: [
      {
        key: `c${index}`,
        groupKey: "g1",
        groupRule: "all" as const,
        kind: "years_experience" as const,
        originalText: "At least three years",
        translationZh: "至少三年",
        constraint: { operator: "gte" as const, value: "3", unit: "years" },
      },
    ],
  };
}

const comparisonRequirements: JDGapRequirementForComparison[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    category: "hard_requirement",
    requirementType: "required",
    originalText: "SQL and commercial reporting",
    translationZh: "SQL 与商业报告",
    sourceExcerpt: "SQL and commercial reporting are required.",
    allowsEquivalent: false,
    explicitGate: false,
    sortOrder: 0,
    criteria: [
      {
        id: criterionIdA,
        groupKey: "g1",
        groupRule: "all",
        kind: "tool",
        originalText: "SQL",
        translationZh: "SQL",
        constraint: { operator: "exact", value: "SQL", unit: null },
        sortOrder: 0,
      },
      {
        id: criterionIdB,
        groupKey: "g2",
        groupRule: "all",
        kind: "responsibility",
        originalText: "Build commercial reports",
        translationZh: "制作商业报告",
        constraint: { operator: "none", value: null, unit: null },
        sortOrder: 1,
      },
    ],
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    category: "language_work_authorization",
    requirementType: "required",
    originalText: "Authorized to work in Germany",
    translationZh: "拥有德国工作许可",
    sourceExcerpt: "Candidates must be authorized to work in Germany.",
    allowsEquivalent: false,
    explicitGate: true,
    sortOrder: 1,
    criteria: [
      {
        id: authorizationCriterionId,
        groupKey: "g1",
        groupRule: "all",
        kind: "work_authorization",
        originalText: "Authorized to work in Germany",
        translationZh: "拥有德国工作许可",
        constraint: { operator: "exact", value: "Germany", unit: null },
        sortOrder: 0,
      },
    ],
  },
];

const confirmedFacts: ConfirmedFactForAnalysis[] = [
  {
    id: confirmedFactId,
    factType: "work_experience",
    title: "Commercial reporting",
    organization: "Example GmbH",
    description: "Built weekly commercial reports.",
    skills: ["SQL"],
    sourceExcerpt: "Built weekly commercial reports.",
  },
  {
    id: authorizationFactId,
    factType: "certification",
    title: "German work authorization",
    organization: null,
    description: "Explicitly confirmed authorization to work in Germany.",
    skills: [],
    sourceExcerpt: null,
  },
];

function assessment(
  criterionId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    criterionId,
    resumeEvidenceStatus: "none" as const,
    resumeExcerpt: null,
    profileFactIds: [],
    gapType: "no_supporting_fact" as const,
    reasonZh: "当前简历没有可验证证据。",
    userQuestionZh: null,
    ...overrides,
  };
}

describe("sanitizeJDStructureOutput", () => {
  const jdText = [
    "At least three years of professional experience",
    "SQL or Python is required for analytics.",
  ].join("\n");

  it("preserves JD order after validating exact source excerpts", () => {
    const second = {
      ...structureRequirement(2),
      originalText: "SQL or Python",
      translationZh: "需要 SQL 或 Python",
      sourceExcerpt: "SQL or Python is required for analytics.",
    };
    const output = {
      jdTranslationZh: "需要至少三年经验，并掌握 SQL 或 Python。",
      requirements: [second, structureRequirement()],
    };

    expect(sanitizeJDStructureOutput({ jdText, output }).requirements.map((row) => row.key)).toEqual([
      "r2",
      "r1",
    ]);
  });

  it("rejects malformed or duplicate local keys, missing criteria, and ungrounded JD excerpts", () => {
    const cases = [
      [{ ...structureRequirement(), key: "unknown" }],
      [structureRequirement(), { ...structureRequirement(2), key: "r1" }],
      [
        {
          ...structureRequirement(),
          criteria: [
            structureRequirement().criteria[0],
            { ...structureRequirement().criteria[0] },
          ],
        },
      ],
      [{ ...structureRequirement(), criteria: [] }],
      [{ ...structureRequirement(), sourceExcerpt: "This text is not in the JD source." }],
    ];

    for (const requirements of cases) {
      expect(() =>
        sanitizeJDStructureOutput({
          jdText,
          output: { jdTranslationZh: "完整中文翻译", requirements },
        }),
      ).toThrow("jd-structure-invalid-output");
    }
  });

  it("never accepts more than eighty requirements", () => {
    expect(() =>
      sanitizeJDStructureOutput({
        jdText,
        output: {
          jdTranslationZh: "完整中文翻译",
          requirements: Array.from({ length: 81 }, (_, index) =>
            structureRequirement(index + 1),
          ),
        },
      }),
    ).toThrow("jd-structure-invalid-output");
  });
});

describe("sanitizeJDGapComparisonOutput", () => {
  const resumeText = [
    "Advanced SQL for customer analytics.",
    "Built weekly commercial reports for leadership.",
    "Authorized to work in Germany.",
  ].join("\n");

  it("rejects unknown, duplicate, and missing criterion IDs atomically", () => {
    const complete = [
      assessment(criterionIdA),
      assessment(criterionIdB),
      assessment(authorizationCriterionId),
    ];
    const cases = [
      [...complete, assessment("99999999-9999-4999-8999-999999999999")],
      [complete[0], complete[0], complete[1], complete[2]],
      [complete[0], complete[1]],
    ];

    for (const assessments of cases) {
      expect(() =>
        sanitizeJDGapComparisonOutput({
          resumeText,
          requirements: comparisonRequirements,
          confirmedFacts,
          confirmedAuthorizationFactIds: [authorizationFactId],
          output: { assessments },
        }),
      ).toThrow("jd-gap-invalid-output");
    }
  });

  it("allowlists facts and preserves grounded direct and partial evidence", () => {
    const result = sanitizeJDGapComparisonOutput({
      resumeText,
      requirements: comparisonRequirements,
      confirmedFacts,
      confirmedAuthorizationFactIds: [authorizationFactId],
      output: {
        assessments: [
          assessment(criterionIdA, {
            resumeEvidenceStatus: "direct",
            resumeExcerpt: "Advanced SQL for customer analytics.",
            profileFactIds: [confirmedFactId, foreignFactId, confirmedFactId],
            gapType: "none",
            reasonZh: "简历明确证明了 SQL 使用。",
          }),
          assessment(criterionIdB, {
            resumeEvidenceStatus: "partial_direct",
            resumeExcerpt: "Built weekly commercial reports for leadership.",
            gapType: "missing_result_or_number",
            reasonZh: "有商业报告经验，但缺少量化影响。",
          }),
          assessment(authorizationCriterionId, {
            resumeEvidenceStatus: "direct",
            resumeExcerpt: "Authorized to work in Germany.",
            profileFactIds: [authorizationFactId],
            gapType: "none",
            reasonZh: "简历引用与已确认许可事实相互印证。",
          }),
        ],
      },
    });

    expect(result.assessments[0]).toMatchObject({
      resumeEvidenceStatus: "direct",
      resumeExcerpt: "Advanced SQL for customer analytics.",
      profileFactIds: [confirmedFactId],
    });
    expect(result.assessments[1].resumeEvidenceStatus).toBe("partial_direct");
    expect(result.rejectedFactIdCount).toBe(1);
    expect(result.rejectedResumeExcerptCount).toBe(0);
  });

  it("downgrades only the criterion with an ungrounded excerpt", () => {
    const result = sanitizeJDGapComparisonOutput({
      resumeText,
      requirements: comparisonRequirements,
      confirmedFacts,
      confirmedAuthorizationFactIds: [authorizationFactId],
      output: {
        assessments: [
          assessment(criterionIdA, {
            resumeEvidenceStatus: "direct",
            resumeExcerpt: "Advanced Python for customer analytics.",
            gapType: "none",
            reasonZh: "引用并不存在。",
          }),
          assessment(criterionIdB, {
            resumeEvidenceStatus: "direct",
            resumeExcerpt: "Built weekly commercial reports for leadership.",
            gapType: "none",
            reasonZh: "简历明确证明了商业报告经验。",
          }),
          assessment(authorizationCriterionId),
        ],
      },
    });

    expect(result.assessments[0]).toMatchObject({
      resumeEvidenceStatus: "none",
      resumeExcerpt: null,
      gapType: "no_supporting_fact",
    });
    expect(result.assessments[1].resumeEvidenceStatus).toBe("direct");
    expect(result.rejectedResumeExcerptCount).toBe(1);
  });

  it("clears excerpts for none/confirmation and enforces explicit authorization confirmation", () => {
    const withoutAuthorizationFact = sanitizeJDGapComparisonOutput({
      resumeText,
      requirements: comparisonRequirements,
      confirmedFacts,
      confirmedAuthorizationFactIds: [],
      output: {
        assessments: [
          assessment(criterionIdA, { resumeExcerpt: "Advanced SQL" }),
          assessment(criterionIdB, {
            resumeEvidenceStatus: "needs_confirmation",
            resumeExcerpt: "Built weekly commercial reports for leadership.",
            gapType: "language_or_authorization_confirmation",
          }),
          assessment(authorizationCriterionId, {
            resumeEvidenceStatus: "direct",
            resumeExcerpt: "Authorized to work in Germany.",
            profileFactIds: [authorizationFactId],
            gapType: "none",
          }),
        ],
      },
    });

    expect(withoutAuthorizationFact.assessments[0].resumeExcerpt).toBeNull();
    expect(withoutAuthorizationFact.assessments[1].resumeExcerpt).toBeNull();
    expect(withoutAuthorizationFact.assessments[2]).toMatchObject({
      resumeEvidenceStatus: "needs_confirmation",
      resumeExcerpt: null,
      gapType: "language_or_authorization_confirmation",
    });

    const profileOnlyAuthorization = sanitizeJDGapComparisonOutput({
      resumeText,
      requirements: comparisonRequirements,
      confirmedFacts,
      confirmedAuthorizationFactIds: [authorizationFactId],
      output: {
        assessments: [
          assessment(criterionIdA),
          assessment(criterionIdB),
          assessment(authorizationCriterionId, {
            profileFactIds: [authorizationFactId],
            gapType: "missing_from_resume",
          }),
        ],
      },
    });

    expect(profileOnlyAuthorization.assessments[2]).toMatchObject({
      resumeEvidenceStatus: "none",
      resumeExcerpt: null,
      profileFactIds: [authorizationFactId],
      gapType: "missing_from_resume",
    });
  });
});
