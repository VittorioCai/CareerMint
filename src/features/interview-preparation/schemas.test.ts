import { describe, expect, it } from "vitest";

import {
  addInterviewQuestionSchema,
  normalizeQuestionPrompt,
  updateInterviewQuestionSchema,
} from "./schemas";

const applicationId = "11111111-1111-4111-8111-111111111111";
const questionId = "22222222-2222-4222-8222-222222222222";
const factId = "33333333-3333-4333-8333-333333333333";

describe("interview preparation schemas", () => {
  it("normalizes cosmetic wording differences to one canonical key", () => {
    expect(normalizeQuestionPrompt("  Why   this role? ")).toBe(
      "why this role",
    );
    expect(normalizeQuestionPrompt("WHY THIS ROLE？")).toBe("why this role");
    expect(
      normalizeQuestionPrompt("\uFEFF Ｆｕｌｌ\u0085 ROADMAP？ \uFEFF"),
    ).toBe("full roadmap");
  });

  it("requires an application for job-specific questions", () => {
    expect(
      addInterviewQuestionSchema.safeParse({
        prompt: "How would you approach this product launch?",
        category: "job_specific",
        applicationId: null,
      }).success,
    ).toBe(false);
    expect(
      addInterviewQuestionSchema.parse({
        prompt: "  How would you approach this product launch?  ",
        category: "job_specific",
        applicationId,
      }),
    ).toEqual({
      prompt: "How would you approach this product launch?",
      category: "job_specific",
      applicationId,
    });
  });

  it("trims reusable preparation content and deduplicates linked facts", () => {
    expect(
      updateInterviewQuestionSchema.parse({
        questionId,
        applicationId: "",
        preparationStatus: "outlined",
        answerOutline: "  Situation → Action → Result  ",
        notes: "   ",
        factIds: [factId, factId],
      }),
    ).toEqual({
      questionId,
      applicationId: null,
      preparationStatus: "outlined",
      answerOutline: "Situation → Action → Result",
      notes: null,
      factIds: [factId],
    });
  });
});
