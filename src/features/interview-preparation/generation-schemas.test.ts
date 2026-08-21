import { describe, expect, it } from "vitest";

import {
  interviewQuestionGenerationOutputSchema,
  sanitizeInterviewQuestionGeneration,
  type InterviewQuestionGenerationCandidate,
} from "./generation-schemas";

const jdText =
  "Lead product discovery across international markets. Advanced SQL is required for funnel analysis.";
const requirements = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    category: "skill",
    text: "Advanced SQL",
    sourceExcerpt: "Advanced SQL is required for funnel analysis.",
    priority: "core",
  },
];

function candidate(
  overrides: Partial<InterviewQuestionGenerationCandidate> = {},
): InterviewQuestionGenerationCandidate {
  return {
    category: "function",
    prompt: "How would you improve funnel analysis for this role?",
    sourceExcerpt: "Advanced SQL is required for funnel analysis.",
    relevanceReason: "The question is grounded in the required SQL work.",
    ...overrides,
  };
}

describe("interview question generation schemas", () => {
  it("accepts the provider envelope and rejects canonicalKey", () => {
    expect(
      interviewQuestionGenerationOutputSchema.parse({
        questions: [candidate()],
      }),
    ).toEqual({ questions: [candidate()] });
    expect(
      interviewQuestionGenerationOutputSchema.safeParse({
        questions: [{ ...candidate(), canonicalKey: "forged" }],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown top-level fields and more than the raw output cap", () => {
    expect(
      interviewQuestionGenerationOutputSchema.safeParse({
        questions: [],
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      interviewQuestionGenerationOutputSchema.safeParse({
        questions: Array.from({ length: 25 }, () => candidate()),
      }).success,
    ).toBe(false);
  });

  it("rejects unknown categories and bounded fields", () => {
    expect(
      interviewQuestionGenerationOutputSchema.safeParse({
        questions: [{ ...candidate(), category: "common" }],
      }).success,
    ).toBe(false);
    expect(
      interviewQuestionGenerationOutputSchema.safeParse({
        questions: [candidate({ prompt: "short" })],
      }).success,
    ).toBe(false);
  });

  it("counts text bounds in Unicode code points", () => {
    expect(
      interviewQuestionGenerationOutputSchema.safeParse({
        questions: [candidate({ prompt: "😀😀😀😀" })],
      }).success,
    ).toBe(false);
    expect(
      interviewQuestionGenerationOutputSchema.safeParse({
        questions: [
          candidate({
            prompt: "😀😀😀😀😀😀😀😀",
            sourceExcerpt: "😀".repeat(240),
            relevanceReason: "😀".repeat(240),
          }),
        ],
      }).success,
    ).toBe(true);
  });

  it("grounds excerpts with NFKC, case, and Unicode whitespace matching", () => {
    const sanitized = sanitizeInterviewQuestionGeneration({
      jdText,
      requirements,
      commonPrompts: [],
      output: {
        questions: [
          candidate({
            sourceExcerpt: "ＡＤＶＡＮＣＥＤ\u00a0SQL is required for funnel analysis.",
          }),
        ],
      },
    });

    expect(sanitized.questions).toHaveLength(1);
    expect(sanitized.rejectedQuestionCount).toBe(0);
  });

  it("folds NEL and BOM consistently when grounding excerpts", () => {
    const foldedJd = "Lead\u0085product\uFEFFdiscovery across markets.";
    const sanitized = sanitizeInterviewQuestionGeneration({
      jdText: foldedJd,
      requirements,
      commonPrompts: [],
      output: {
        questions: [
          candidate({ sourceExcerpt: "lead product discovery across markets." }),
        ],
      },
    });

    expect(sanitized.questions).toHaveLength(1);
  });

  it("rejects invented excerpts and common canonical duplicates", () => {
    const sanitized = sanitizeInterviewQuestionGeneration({
      jdText,
      requirements,
      commonPrompts: ["Why this role?"],
      output: {
        questions: [
          candidate({ sourceExcerpt: "This sentence is not in the JD." }),
          candidate({ prompt: "Why this role?" }),
          candidate(),
        ],
      },
    });

    expect(sanitized.questions).toHaveLength(1);
    expect(sanitized.rejectedQuestionCount).toBe(2);
  });

  it("deduplicates canonical prompts and keeps only the first six valid candidates", () => {
    const questions = Array.from({ length: 9 }, (_, index) =>
      candidate({
        prompt:
          index === 1 || index === 2
            ? "  HOW WOULD YOU IMPROVE FUNNEL ANALYSIS FOR THIS ROLE 0?  "
            : `How would you improve funnel analysis for this role ${index}?`,
      }),
    );
    const sanitized = sanitizeInterviewQuestionGeneration({
      jdText,
      requirements,
      commonPrompts: [],
      output: { questions },
    });

    expect(sanitized.questions).toHaveLength(6);
    expect(sanitized.rejectedQuestionCount).toBe(3);
  });

  it("raises the stable invalid-output error when no candidate remains", () => {
    expect(() =>
      sanitizeInterviewQuestionGeneration({
        jdText,
        requirements,
        commonPrompts: [],
        output: {
          questions: [candidate({ sourceExcerpt: "Invented evidence." })],
        },
      }),
    ).toThrow("interview-question-generation-invalid-output");
  });

  it("rejects an empty canonical key while retaining valid candidates", () => {
    const sanitized = sanitizeInterviewQuestionGeneration({
      jdText,
      requirements,
      commonPrompts: [],
      output: {
        questions: [candidate({ prompt: "????????" }), candidate()],
      },
    });

    expect(sanitized.questions).toEqual([candidate()]);
    expect(sanitized.rejectedQuestionCount).toBe(1);
  });

  it("raises the stable invalid-output error when every canonical key is empty", () => {
    expect(() =>
      sanitizeInterviewQuestionGeneration({
        jdText,
        requirements,
        commonPrompts: [],
        output: { questions: [candidate({ prompt: "????????" })] },
      }),
    ).toThrow("interview-question-generation-invalid-output");
  });

  it("rejects canonical keys longer than 500 after NFKC expansion", () => {
    const expandedPrompt = "ﬃ".repeat(500);
    const sanitized = sanitizeInterviewQuestionGeneration({
      jdText,
      requirements,
      commonPrompts: [],
      output: {
        questions: [candidate({ prompt: expandedPrompt }), candidate()],
      },
    });

    expect(sanitized.questions).toEqual([candidate()]);
    expect(sanitized.rejectedQuestionCount).toBe(1);
  });

  it("raises the stable invalid-output error when every canonical key is too long", () => {
    expect(() =>
      sanitizeInterviewQuestionGeneration({
        jdText,
        requirements,
        commonPrompts: [],
        output: {
          questions: [candidate({ prompt: "ﬃ".repeat(500) })],
        },
      }),
    ).toThrow("interview-question-generation-invalid-output");
  });
});
