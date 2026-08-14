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
        requirements: categories.map((category, index) => ({
          category,
          text: `Requirement ${index}`,
          sourceExcerpt: "Lead product discovery across international markets.",
          priority: index === 0 ? "core" : "supporting",
          matchStatus: matchStates[index % matchStates.length],
          matchReason: null,
          matchedFactIds: [],
        })),
      }).requirements,
    ).toHaveLength(categories.length);
  });

  it("rejects oversized output and malformed evidence identifiers", () => {
    expect(() =>
      jdAnalysisSchema.parse({
        requirements: [
          {
            category: "skill",
            text: "x".repeat(501),
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

  it("keeps exact JD evidence, allowlists confirmed facts, downgrades unsupported matches, and deduplicates", () => {
    const jdText = [
      "Lead product discovery across international markets.",
      "Advanced SQL experience is required for funnel analysis.",
    ].join("\n");

    const sanitized = sanitizeJDAnalysis({
      jdText,
      confirmedFacts,
      analysis: {
        requirements: [
          {
            category: "responsibility",
            text: "Lead international product discovery",
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
            sourceExcerpt: "Ten years of leadership are required.",
            priority: "core",
            matchStatus: "evidence",
            matchReason: "Unsupported",
            matchedFactIds: [firstFactId],
          },
          {
            category: "preferred",
            text: "Enterprise background",
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
