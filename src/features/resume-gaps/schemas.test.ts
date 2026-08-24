import { describe, expect, it } from "vitest";

import {
  classifyGap,
  classifyProfileOnlyRequirement,
  explainGap,
  resumeGapProviderOutputSchema,
  sanitizeResumeGapOutput,
  selectPriorityRequirements,
  summarizeRequirements,
  type ResumeGapRequirement,
  type ResumeGapItemView,
} from "./schemas";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const thirdId = "33333333-3333-4333-8333-333333333333";
const unknownId = "99999999-9999-4999-8999-999999999999";

const requirements: ResumeGapRequirement[] = [
  {
    id: firstId,
    category: "skill",
    text: "SQL",
    priority: "core",
    sortOrder: 0,
    matchStatus: "evidence",
  },
  {
    id: secondId,
    category: "responsibility",
    text: "Lead product discovery",
    priority: "core",
    sortOrder: 1,
    matchStatus: "none",
  },
  {
    id: thirdId,
    category: "preferred",
    text: "International markets",
    priority: "supporting",
    sortOrder: 2,
    matchStatus: "partial",
  },
];

function outputItem(
  requirementId: string,
  resumeCoverage: "covered" | "partial" | "missing",
  resumeExcerpt: string | null,
) {
  return { requirementId, resumeCoverage, resumeExcerpt };
}

describe("resume gap provider schemas", () => {
  it("accepts only a strict, bounded coverage-only envelope", () => {
    const valid = {
      items: [outputItem(firstId, "covered", "SQL")],
    };

    expect(resumeGapProviderOutputSchema.parse(valid)).toEqual(valid);
    expect(
      resumeGapProviderOutputSchema.safeParse({
        ...valid,
        extra: "provider prose",
      }).success,
    ).toBe(false);
    expect(
      resumeGapProviderOutputSchema.safeParse({
        items: [
          {
            ...valid.items[0],
            extra: "suggestion",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      resumeGapProviderOutputSchema.safeParse({
        items: Array.from({ length: 81 }, () =>
          outputItem(firstId, "missing", null),
        ),
      }).success,
    ).toBe(false);
    expect(
      resumeGapProviderOutputSchema.safeParse({
        items: [outputItem("not-a-uuid", "missing", null)],
      }).success,
    ).toBe(false);
    expect(
      resumeGapProviderOutputSchema.safeParse({
        items: [outputItem(firstId, "covered", "")],
      }).success,
    ).toBe(false);
    expect(
      resumeGapProviderOutputSchema.safeParse({
        items: [outputItem(firstId, "covered", "x".repeat(701))],
      }).success,
    ).toBe(false);
    expect(
      resumeGapProviderOutputSchema.safeParse({
        items: [
          {
            requirementId: firstId,
            resumeCoverage: "unsupported",
            resumeExcerpt: null,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("sanitizeResumeGapOutput", () => {
  const input = {
    resumeText:
      "Product analyst\nAdvanced SQL\u0085Lead product discovery across markets.",
    requirements,
  };

  it("returns one verified item per requirement in supplied order", () => {
    const sanitized = sanitizeResumeGapOutput({
      ...input,
      output: {
        items: [
          outputItem(thirdId, "partial", "  LEAD product discovery  "),
          outputItem(firstId, "covered", " SQL "),
          outputItem(secondId, "missing", null),
        ],
      },
    });

    expect(sanitized.items).toEqual([
      outputItem(firstId, "covered", "SQL"),
      outputItem(secondId, "missing", null),
      outputItem(thirdId, "partial", "LEAD product discovery"),
    ]);
  });

  it("rejects unknown IDs, duplicate IDs, and missing supplied requirements", () => {
    for (const items of [
      [
        outputItem(firstId, "covered", "SQL"),
        outputItem(secondId, "missing", null),
        outputItem(thirdId, "missing", null),
        outputItem(unknownId, "missing", null),
      ],
      [
        outputItem(firstId, "covered", "SQL"),
        outputItem(firstId, "covered", "SQL"),
        outputItem(secondId, "missing", null),
        outputItem(thirdId, "missing", null),
      ],
      [outputItem(firstId, "covered", "SQL")],
    ]) {
      expect(() => sanitizeResumeGapOutput({ ...input, output: { items } })).toThrow(
        "resume-gap-invalid-output",
      );
    }
  });

  it("enforces the coverage and excerpt invariants", () => {
    const cases = [
      [outputItem(firstId, "missing", "SQL"), "missing requires null"],
      [outputItem(firstId, "covered", null), "covered requires excerpt"],
      [outputItem(firstId, "partial", "   "), "partial requires excerpt"],
      [outputItem(firstId, "covered", "Python"), "excerpt must be grounded"],
      [outputItem(firstId, "covered", "x".repeat(701)), "excerpt is bounded"],
    ] as const;

    for (const [item] of cases) {
      const output = {
        items: [
          item,
          outputItem(secondId, "missing", null),
          outputItem(thirdId, "missing", null),
        ],
      };
      expect(() => sanitizeResumeGapOutput({ ...input, output })).toThrow(
        "resume-gap-invalid-output",
      );
    }
  });

  it("allows short exact excerpts such as SQL and folds Unicode whitespace", () => {
    const sanitized = sanitizeResumeGapOutput({
      resumeText: "Advanced\uFEFFSQL\u0085experience",
      requirements: [requirements[0]],
      output: {
        items: [outputItem(firstId, "covered", " SQL ")],
      },
    });

    expect(sanitized.items[0].resumeExcerpt).toBe("SQL");
  });

});

function item(
  resumeCoverage: ResumeGapItemView["resumeCoverage"],
  profileEvidence: ResumeGapItemView["profileEvidence"],
  matchStatus: ResumeGapRequirement["matchStatus"] = "none",
): ResumeGapItemView {
  return {
    id: firstId,
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    applicationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    requirementId: firstId,
    requirementText: "SQL",
    category: "skill",
    priority: "core",
    jdSourceExcerpt: "SQL experience is required.",
    resumeCoverage,
    verifiedResumeExcerpt: resumeCoverage === "missing" ? null : "SQL",
    sortOrder: 0,
    profileEvidence,
    matchStatus,
    matchReason: null,
  };
}

describe("deterministic resume gap classification", () => {
  it("maps coverage and profile evidence to stable display groups", () => {
    expect(classifyGap(item("covered", []))).toBe("covered");
    expect(classifyGap(item("covered", [{} as never]))).toBe("covered");
    expect(classifyGap(item("partial", []))).toBe("partial_coverage");
    expect(classifyGap(item("partial", [{} as never]))).toBe("partial_coverage");
    expect(classifyGap(item("missing", [{} as never]))).toBe("resume_omission");
    expect(classifyGap(item("missing", []))).toBe("missing_evidence");
  });

  it("explains each group locally and reports confirmed fact count for omissions", () => {
    const providerProse = "The model recommends adding a stronger bullet.";
    expect(explainGap(item("covered", []))).not.toContain(providerProse);
    expect(explainGap(item("partial", []))).not.toContain(providerProse);
    expect(explainGap(item("missing", [{} as never, {} as never]))).toContain("2");
    expect(explainGap(item("missing", [{} as never, {} as never]))).not.toContain(providerProse);
  });

  it("classifies profile-only requirements without ever returning resume omission", () => {
    expect(classifyProfileOnlyRequirement({ ...requirements[0], matchStatus: "evidence" })).toBe(
      "profile_supported",
    );
    expect(classifyProfileOnlyRequirement({ ...requirements[0], matchStatus: "partial" })).toBe(
      "partial_match",
    );
    expect(classifyProfileOnlyRequirement({ ...requirements[0], matchStatus: "none" })).toBe(
      "missing_evidence",
    );
    expect(classifyProfileOnlyRequirement({ ...requirements[0], matchStatus: "needs_user" })).toBe(
      "needs_user",
    );
  });
});

describe("JD requirement summary and priority selection", () => {
  const prioritized: ResumeGapRequirement[] = [
    { ...requirements[2], sortOrder: 6, matchStatus: "evidence" },
    { ...requirements[1], sortOrder: 4, matchStatus: "partial" },
    { ...requirements[0], sortOrder: 5, matchStatus: "evidence" },
    { id: unknownId, category: "skill", text: "A", priority: "supporting", sortOrder: 1, matchStatus: "needs_user" },
    { id: "44444444-4444-4444-8444-444444444444", category: "skill", text: "B", priority: "supporting", sortOrder: 2, matchStatus: "none" },
    { id: "55555555-5555-4555-8555-555555555555", category: "skill", text: "C", priority: "core", sortOrder: 3, matchStatus: "none" },
    { id: "66666666-6666-4666-8666-666666666666", category: "skill", text: "D", priority: "core", sortOrder: 7, matchStatus: "needs_user" },
  ];

  it("selects at most five requirements in attention-first rank order", () => {
    expect(selectPriorityRequirements(prioritized).map((requirement) => requirement.id)).toEqual([
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
      secondId,
      "44444444-4444-4444-8444-444444444444",
      unknownId,
    ]);
    expect(selectPriorityRequirements(prioritized, 2).map((requirement) => requirement.id)).toEqual([
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ]);
  });

  it("summarizes total, core, confirmed evidence, and core attention", () => {
    expect(summarizeRequirements(prioritized)).toEqual({
      total: 7,
      core: 4,
      evidence: 2,
      attention: 3,
    });
  });
});
