import { describe, expect, it } from "vitest";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import {
  resumeSuggestionOutputSchema,
  sanitizeResumeSuggestions,
  type ResumeRequirementContext,
} from "./schemas";

const factId = "11111111-1111-4111-8111-111111111111";
const secondFactId = "22222222-2222-4222-8222-222222222222";
const foreignFactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requirementId = "33333333-3333-4333-8333-333333333333";
const foreignRequirementId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const confirmedFacts: ConfirmedFactForAnalysis[] = [
  {
    id: factId,
    factType: "achievement",
    title: "Checkout conversion improvement",
    organization: "Acme GmbH",
    description: "Improved checkout conversion by 18% through funnel analysis.",
    skills: ["SQL", "Funnel analysis"],
    sourceExcerpt: "Improved checkout conversion by 18% through funnel analysis.",
  },
  {
    id: secondFactId,
    factType: "skill",
    title: "SQL",
    organization: null,
    description: "Used SQL for product and funnel analysis.",
    skills: ["SQL"],
    sourceExcerpt: null,
  },
];

const requirements: ResumeRequirementContext[] = [
  {
    id: requirementId,
    category: "skill",
    text: "Advanced SQL and funnel analysis",
    priority: "core",
  },
];

describe("resume customization schemas", () => {
  it("accepts bounded structured suggestions across supported sections", () => {
    const sections = [
      "summary",
      "experience",
      "project",
      "education",
      "skills",
      "certification",
      "language",
      "achievement",
    ] as const;

    const parsed = resumeSuggestionOutputSchema.parse({
      suggestions: sections.map((section) => ({
        section,
        content: `Evidence-backed ${section} content`,
        reason: "Makes relevant evidence easier to find.",
        factIds: [factId],
        requirementIds: [requirementId],
      })),
    });

    expect(parsed.suggestions).toHaveLength(sections.length);
  });

  it("rejects oversized output, missing evidence, and malformed identifiers", () => {
    expect(() =>
      resumeSuggestionOutputSchema.parse({
        suggestions: [
          {
            section: "experience",
            content: "x".repeat(701),
            reason: "Relevant wording",
            factIds: [],
            requirementIds: ["not-a-uuid"],
          },
        ],
      }),
    ).toThrow();
  });

  it("keeps only suggestions fully grounded in confirmed facts and current requirements", () => {
    const sanitized = sanitizeResumeSuggestions({
      confirmedFacts,
      requirements,
      output: {
        suggestions: [
          {
            section: "achievement",
            content:
              "Improved checkout conversion by 18% through SQL-led funnel analysis.",
            reason: "Directly supports the role's funnel-analysis requirement.",
            factIds: [factId, secondFactId, factId],
            requirementIds: [requirementId, foreignRequirementId],
          },
          {
            section: "achievement",
            content:
              "  improved CHECKOUT conversion by 18% through SQL-led funnel analysis. ",
            reason: "Duplicate wording",
            factIds: [factId],
            requirementIds: [requirementId],
          },
          {
            section: "experience",
            content: "Led a 40-person global product organization.",
            reason: "Unsupported leadership claim.",
            factIds: [foreignFactId],
            requirementIds: [requirementId],
          },
          {
            section: "achievement",
            content: "Improved checkout conversion by 40%.",
            reason: "Changes the confirmed result number.",
            factIds: [factId],
            requirementIds: [requirementId],
          },
        ],
      },
    });

    expect(sanitized.suggestions).toEqual([
      {
        section: "achievement",
        content:
          "Improved checkout conversion by 18% through SQL-led funnel analysis.",
        reason: "Directly supports the role's funnel-analysis requirement.",
        factIds: [factId, secondFactId],
        requirementIds: [requirementId],
      },
    ]);
    expect(sanitized.rejectedSuggestionCount).toBe(3);
    expect(sanitized.rejectedReferenceCount).toBe(2);
  });
});
