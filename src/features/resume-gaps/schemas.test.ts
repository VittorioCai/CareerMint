import { describe, expect, it } from "vitest";

import {
  classifyGap,
  classifyProfileOnlyRequirement,
  explainGap,
  resumeGapAIResultSchema,
  resumeGapEstimatedCostSchema,
  resumeGapItemSchema,
  resumeGapRunResultSchema,
  resumeGapRunSchema,
  resumeGapProviderOutputSchema,
  normalizeStoredIdentifier,
  sanitizeResumeGapOutput,
  selectPriorityRequirements,
  summarizeRequirements,
  type ResumeGapCurrentRequirement,
  type ResumeGapItemView,
} from "./schemas";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const thirdId = "33333333-3333-4333-8333-333333333333";
const unknownId = "99999999-9999-4999-8999-999999999999";

const requirements: ResumeGapCurrentRequirement[] = [
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
  matchStatus: ResumeGapCurrentRequirement["matchStatus"] = "none",
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
    createdAt: "2026-08-24T00:00:00.000Z",
    profileEvidence,
    matchStatus,
    matchReason: null,
  };
}

describe("deterministic resume gap classification", () => {
  it("maps coverage and profile evidence to stable display groups", () => {
    expect([
      classifyGap(item("covered", [])),
      classifyGap(item("partial", [])),
      classifyGap(item("missing", [{} as never])),
      classifyGap(item("missing", [])),
    ]).toEqual([
      "covered",
      "partial_coverage",
      "resume_omission",
      "missing_evidence",
    ]);
    expect(classifyGap(item("covered", [{} as never]))).toBe("covered");
    expect(classifyGap(item("partial", [{} as never]))).toBe("partial_coverage");
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

  it("does not silently classify requirements whose match status is absent", () => {
    const missingStatus = {
      ...requirements[0],
      matchStatus: undefined,
    } as unknown as ResumeGapCurrentRequirement;

    expect(() => classifyProfileOnlyRequirement(missingStatus)).toThrow(
      "resume-gap-invalid-requirement",
    );
    expect(() => selectPriorityRequirements([missingStatus])).toThrow(
      "resume-gap-invalid-requirement",
    );
    expect(() => summarizeRequirements([missingStatus])).toThrow(
      "resume-gap-invalid-requirement",
    );
  });
});

describe("JD requirement summary and priority selection", () => {
  const prioritized: ResumeGapCurrentRequirement[] = [
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

  it("uses one final evidence rank ordered by sortOrder regardless of priority", () => {
    const evidence = [
      { ...requirements[0], sortOrder: 8, matchStatus: "evidence" as const },
      { ...requirements[2], sortOrder: 2, matchStatus: "evidence" as const },
      {
        ...requirements[0],
        id: "00000000-0000-4000-8000-000000000000",
        sortOrder: 2,
        matchStatus: "evidence" as const,
      },
    ];

    expect(selectPriorityRequirements(evidence).map((requirement) => requirement.id)).toEqual([
      thirdId,
      "00000000-0000-4000-8000-000000000000",
      firstId,
    ]);
  });

  it("preserves supplied order for equal rank and sortOrder", () => {
    const equalRank = [
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        category: "skill" as const,
        text: "First gap",
        priority: "core" as const,
        sortOrder: 1,
        matchStatus: "none" as const,
      },
      {
        id: "00000000-0000-4000-8000-000000000000",
        category: "skill" as const,
        text: "Second gap",
        priority: "core" as const,
        sortOrder: 1,
        matchStatus: "none" as const,
      },
    ];

    expect(selectPriorityRequirements(equalRank).map((requirement) => requirement.id)).toEqual([
      equalRank[0].id,
      equalRank[1].id,
    ]);
  });

  it("clamps the caller limit to the hard maximum of five", () => {
    expect(selectPriorityRequirements(prioritized, 100)).toHaveLength(5);
    expect(selectPriorityRequirements(prioritized, Number.POSITIVE_INFINITY)).toHaveLength(0);
    expect(selectPriorityRequirements(prioritized, Number.NaN)).toHaveLength(0);
    expect(selectPriorityRequirements(prioritized, -1)).toHaveLength(0);
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

describe("stored resume-gap DTOs and safe metadata", () => {
  const historicalItem = {
    id: firstId,
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    applicationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    requirementId: null,
    requirementText: "SQL",
    category: "skill",
    priority: "core",
    jdSourceExcerpt: "SQL experience is required.",
    resumeCoverage: "missing",
    verifiedResumeExcerpt: null,
    sortOrder: 0,
    createdAt: "2026-08-24T00:00:00.000Z",
  };

  it("parses a historical item whose deleted requirement ID is null", () => {
    expect(resumeGapItemSchema.parse(historicalItem).requirementId).toBeNull();
  });

  it("accepts valid safe usage and cost metadata without transforming it", () => {
    expect(
      resumeGapAIResultSchema.safeParse({
        provider: "deepseek",
        model: "deepseek-chat",
        requestId: "req_123:ok",
        usage: {
          inputCacheHitTokens: 1,
          inputCacheMissTokens: 2,
          outputTokens: 3,
        },
        priceScheduleVersion: "2026-08-24:v1",
      }).success,
    ).toBe(true);
    expect(
      resumeGapEstimatedCostSchema.safeParse({
        amount: 0.01,
        currency: "USD",
        scheduleVersion: "2026-08-24:v1",
        tier: "default",
      }).success,
    ).toBe(true);
  });

  it("rejects untrimmed or invalid request IDs and cost schedule versions", () => {
    for (const requestId of [" req_123", "req 123", "req_123 ", ""]) {
      expect(
        resumeGapAIResultSchema.safeParse({
          provider: "deepseek",
          model: "deepseek-chat",
          requestId,
          usage: {
            inputCacheHitTokens: 1,
            inputCacheMissTokens: 2,
            outputTokens: 3,
          },
          priceScheduleVersion: "2026-08-24:v1",
        }).success,
      ).toBe(false);
    }

    for (const scheduleVersion of [" 2026-08-24:v1", "2026 08", "2026-08-24:v1 ", ""]) {
      expect(
        resumeGapEstimatedCostSchema.safeParse({
          amount: 0,
          currency: "USD",
          scheduleVersion,
          tier: "default",
        }).success,
      ).toBe(false);
    }
  });

  it("rejects provider and model metadata with surrounding whitespace", () => {
    const valid = {
      provider: "deepseek",
      model: "deepseek-chat",
      requestId: null,
      usage: {
        inputCacheHitTokens: 1,
        inputCacheMissTokens: 2,
        outputTokens: 3,
      },
      priceScheduleVersion: null,
    };

    expect(resumeGapAIResultSchema.safeParse({ ...valid, provider: " deepseek" }).success).toBe(false);
    expect(resumeGapAIResultSchema.safeParse({ ...valid, model: "deepseek-chat " }).success).toBe(false);
  });

  it("bounds generic stored metadata by Unicode code points", () => {
    expect(
      resumeGapAIResultSchema.safeParse({
        provider: "😀".repeat(80),
        model: "deepseek-chat",
        requestId: null,
        usage: {
          inputCacheHitTokens: 0,
          inputCacheMissTokens: 0,
          outputTokens: 0,
        },
        priceScheduleVersion: null,
      }).success,
    ).toBe(true);
    expect(
      resumeGapAIResultSchema.safeParse({
        provider: "😀".repeat(81),
        model: "deepseek-chat",
        requestId: null,
        usage: {
          inputCacheHitTokens: 0,
          inputCacheMissTokens: 0,
          outputTokens: 0,
        },
        priceScheduleVersion: null,
      }).success,
    ).toBe(false);
  });

  it("normalizes optional upstream identifiers to one safe stored form", () => {
    expect(normalizeStoredIdentifier(null)).toBeNull();
    expect(normalizeStoredIdentifier(undefined)).toBeNull();
    expect(normalizeStoredIdentifier(" req_123 ")).toBe("req_123");
    expect(normalizeStoredIdentifier("2026-08-24:v1")).toBe("2026-08-24:v1");
    expect(normalizeStoredIdentifier("req 123")).toBeNull();
    expect(normalizeStoredIdentifier("***")).toBeNull();
  });
});

describe("stored resume-gap result and run state contracts", () => {
  const ai = {
    provider: "deepseek",
    model: "deepseek-chat",
    requestId: "req_123",
    usage: {
      inputCacheHitTokens: 1,
      inputCacheMissTokens: 2,
      outputTokens: 3,
    },
    priceScheduleVersion: "2026-08-24:v1",
  };
  const validResult = {
    acceptedItemCount: 2,
    coveredItemCount: 1,
    partialItemCount: 1,
    missingItemCount: 0,
    ai,
    estimatedCost: null,
  };
  const timestamp = "2026-08-24T00:00:00.000Z";

  it("enforces bounded counts, accepted-count sums, and cost-version equality", () => {
    expect(resumeGapRunResultSchema.safeParse(validResult).success).toBe(true);
    expect(
      resumeGapRunResultSchema.safeParse({
        ...validResult,
        acceptedItemCount: 3,
      }).success,
    ).toBe(false);
    expect(
      resumeGapRunResultSchema.safeParse({
        ...validResult,
        coveredItemCount: 81,
      }).success,
    ).toBe(false);
    expect(
      resumeGapRunResultSchema.safeParse({
        ...validResult,
        estimatedCost: {
          amount: 0.01,
          currency: "USD",
          scheduleVersion: "other-v1",
          tier: "default",
        },
      }).success,
    ).toBe(false);
    expect(
      resumeGapRunResultSchema.safeParse({
        ...validResult,
        ai: { ...ai, priceScheduleVersion: null },
        estimatedCost: {
          amount: 0.01,
          currency: "USD",
          scheduleVersion: "2026-08-24:v1",
          tier: "default",
        },
      }).success,
    ).toBe(false);
  });

  it("keeps nested result objects strict", () => {
    expect(
      resumeGapRunResultSchema.safeParse({
        ...validResult,
        ai: {
          ...ai,
          usage: { ...ai.usage, extra: 4 },
        },
      }).success,
    ).toBe(false);
  });

  const runBase = {
    id: firstId,
    applicationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    analysisRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sourceAssetId: null,
    sourceFilename: "resume.pdf",
    sourceSha256: "a".repeat(64),
    inputHash: "b".repeat(64),
    provider: "deepseek",
    model: "deepseek-chat",
    attemptCount: 1,
    result: validResult,
    errorCode: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp,
  };

  it.each([
    ["queued", { attemptCount: 0, startedAt: null, finishedAt: null, result: null, errorCode: null, errorMessage: null }],
    ["running", { attemptCount: 1, startedAt: timestamp, finishedAt: null, result: null, errorCode: null, errorMessage: null }],
    ["succeeded", { attemptCount: 1, startedAt: timestamp, finishedAt: timestamp, result: validResult, errorCode: null, errorMessage: null }],
    ["failed", { attemptCount: 1, startedAt: timestamp, finishedAt: timestamp, result: null, errorCode: "resume-gap-failed", errorMessage: "safe failure" }],
  ] as const)("accepts the %s database state", (status, state) => {
    expect(resumeGapRunSchema.safeParse({ ...runBase, status, ...state }).success).toBe(true);
  });

  it("rejects invalid run state transitions and non-ISO timestamps", () => {
    expect(
      resumeGapRunSchema.safeParse({
        ...runBase,
        status: "queued",
        attemptCount: 1,
      }).success,
    ).toBe(false);
    expect(
      resumeGapRunSchema.safeParse({
        ...runBase,
        status: "succeeded",
        startedAt: null,
      }).success,
    ).toBe(false);
    expect(
      resumeGapRunSchema.safeParse({
        ...runBase,
        createdAt: "not-a-timestamp",
      }).success,
    ).toBe(false);
    expect(
      resumeGapRunSchema.safeParse({
        ...runBase,
        attemptCount: 1001,
      }).success,
    ).toBe(false);
  });
});
