import { describe, expect, it } from "vitest";

import {
  jdAnalysisSchema,
  sanitizeJDAnalysis,
  type ConfirmedFactForAnalysis,
} from "./schemas";

const firstFactId = "11111111-1111-4111-8111-111111111111";
const secondFactId = "22222222-2222-4222-8222-222222222222";
const foreignFactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const confirmedFacts: ConfirmedFactForAnalysis[] = [
  {
    id: firstFactId,
    factType: "achievement",
    title: "Checkout conversion improvement",
    organization: "Acme GmbH",
    description: "Improved checkout conversion by 18% through funnel analysis.",
    skills: ["Funnel analysis", "SQL"],
    sourceExcerpt:
      "Improved checkout conversion by 18% through funnel analysis.",
  },
  {
    id: secondFactId,
    factType: "skill",
    title: "SQL",
    organization: null,
    description: "Advanced SQL analysis",
    skills: ["SQL"],
    sourceExcerpt: null,
  },
];

describe("JD analysis schemas", () => {
  it("accepts every supported requirement category and text-labelled match state", () => {
    const categories = [
      "responsibility",
      "hard_requirement",
      "preferred",
      "skill",
      "language_work_authorization",
      "location_workplace",
      "compensation",
    ] as const;
    const matchStates = ["evidence", "partial", "none", "needs_user"] as const;

    expect(
      jdAnalysisSchema.parse({
        jdTranslationZh: "我们正在寻找一位能够推动产品探索的人才。",
        requirements: categories.map((category, index) => ({
          category,
          text: `Requirement ${index}`,
          translationZh: `要求 ${index}`,
          sourceExcerpt: "Lead product discovery across international markets.",
          priority: index === 0 ? "core" : "supporting",
          matchStatus: matchStates[index % matchStates.length],
          matchReason: null,
          matchedFactIds: [],
        })),
      }).requirements,
    ).toHaveLength(categories.length);
  });

  it("requires bounded Chinese translations for the JD and every requirement", () => {
    const requirement = {
      category: "skill",
      text: "Advanced SQL",
      sourceExcerpt: "Advanced SQL experience is required.",
      priority: "core",
      matchStatus: "none",
      matchReason: null,
      matchedFactIds: [],
    };

    expect(
      jdAnalysisSchema.safeParse({
        jdTranslationZh: "需要高级 SQL 经验。",
        requirements: [{ ...requirement, translationZh: "高级 SQL" }],
      }).success,
    ).toBe(true);
    expect(
      jdAnalysisSchema.safeParse({
        requirements: [{ ...requirement, translationZh: "高级 SQL" }],
      }).success,
    ).toBe(false);
    expect(
      jdAnalysisSchema.safeParse({
        jdTranslationZh: "需要高级 SQL 经验。",
        requirements: [requirement],
      }).success,
    ).toBe(false);
    expect(
      jdAnalysisSchema.safeParse({
        jdTranslationZh: "译".repeat(100_001),
        requirements: [{ ...requirement, translationZh: "高级 SQL" }],
      }).success,
    ).toBe(false);
  });

  it("rejects oversized output and malformed evidence identifiers", () => {
    expect(() =>
      jdAnalysisSchema.parse({
        jdTranslationZh: "需要 SQL 经验。",
        requirements: [
          {
            category: "skill",
            text: "x".repeat(501),
            translationZh: "高级 SQL",
            sourceExcerpt: "SQL experience is required.",
            priority: "core",
            matchStatus: "evidence",
            matchReason: null,
            matchedFactIds: ["not-a-uuid"],
          },
        ],
      }),
    ).toThrow();
  });

  it("counts requirement text, evidence, and reasons in Unicode code points", () => {
    const valid = {
      category: "skill" as const,
      text: "😀".repeat(500),
      translationZh: "高级 SQL",
      sourceExcerpt: "😀".repeat(12),
      priority: "core" as const,
      matchStatus: "partial" as const,
      matchReason: "😀".repeat(700),
      matchedFactIds: [],
    };

    expect(jdAnalysisSchema.safeParse({ jdTranslationZh: "完整翻译", requirements: [valid] }).success).toBe(
      true,
    );
    expect(
      jdAnalysisSchema.safeParse({
        jdTranslationZh: "完整翻译",
        requirements: [{ ...valid, sourceExcerpt: "😀".repeat(6) }],
      }).success,
    ).toBe(false);
  });

  it("keeps exact JD evidence, allowlists confirmed facts, downgrades unsupported matches, and deduplicates", () => {
    const jdText = [
      "Lead product discovery across international markets.",
      "Advanced SQL experience is required for funnel analysis.",
    ].join("\n");

    const sanitized = sanitizeJDAnalysis({
      jdText,
      confirmedFacts,
      analysis: {
        jdTranslationZh: "在国际市场推动产品探索，并使用高级 SQL。",
        requirements: [
          {
            category: "responsibility",
            text: "Lead international product discovery",
            translationZh: "推动国际产品探索",
            sourceExcerpt:
              "Lead product discovery across international markets.",
            priority: "core",
            matchStatus: "partial",
            matchReason: "The achievement supports product analysis work.",
            matchedFactIds: [firstFactId, foreignFactId],
          },
          {
            category: "responsibility",
            text: "  lead INTERNATIONAL product discovery ",
            translationZh: "推动国际产品探索",
            sourceExcerpt:
              "Lead product discovery across international markets.",
            priority: "supporting",
            matchStatus: "none",
            matchReason: null,
            matchedFactIds: [],
          },
          {
            category: "skill",
            text: "Advanced SQL",
            translationZh: "高级 SQL",
            sourceExcerpt:
              "Advanced SQL experience is required for funnel analysis.",
            priority: "core",
            matchStatus: "evidence",
            matchReason: "The confirmed skill names SQL.",
            matchedFactIds: [secondFactId],
          },
          {
            category: "hard_requirement",
            text: "Ten years of leadership",
            translationZh: "十年领导经验",
            sourceExcerpt: "Ten years of leadership are required.",
            priority: "core",
            matchStatus: "evidence",
            matchReason: "Unsupported",
            matchedFactIds: [firstFactId],
          },
          {
            category: "preferred",
            text: "Enterprise background",
            translationZh: "企业背景",
            sourceExcerpt:
              "Lead product discovery across international markets.",
            priority: "supporting",
            matchStatus: "evidence",
            matchReason: "Points to a fact outside the allowlist.",
            matchedFactIds: [foreignFactId],
          },
        ],
      },
    });

    expect(sanitized.requirements).toHaveLength(3);
    expect(sanitized.jdTranslationZh).toBe("在国际市场推动产品探索，并使用高级 SQL。");
    expect(sanitized.requirements[0].matchedFactIds).toEqual([firstFactId]);
    expect(sanitized.requirements[1].matchedFactIds).toEqual([secondFactId]);
    expect(sanitized.requirements[2]).toMatchObject({
      text: "Enterprise background",
      matchStatus: "none",
      matchReason: null,
      matchedFactIds: [],
    });
    expect(sanitized.rejectedRequirementCount).toBe(2);
    expect(sanitized.rejectedEvidenceCount).toBe(2);
  });
});
