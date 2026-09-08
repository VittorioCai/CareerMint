import { describe, expect, it } from "vitest";

import { interviewQuestionGenerationInstructions } from "./generation-prompt";

describe("interview question generation prompt", () => {
  it("asks the model to find what the JD emphasises rather than any sentence", () => {
    // Questions used to lean on a structured requirement list produced by a
    // separate JD analysis pass. That pass was the difference analysis under an
    // older name, so the list is gone and the JD text is the only ground truth.
    // Interview preparation is about what the role will be probed on, which is
    // not the same question the difference analysis answers about a resume.
    expect(interviewQuestionGenerationInstructions).toContain("emphasis");
    expect(interviewQuestionGenerationInstructions).toContain("hard requirement");
    expect(interviewQuestionGenerationInstructions).not.toContain(
      "structured requirements",
    );
  });

  it("keeps every question traceable to the job description", () => {
    expect(interviewQuestionGenerationInstructions).toContain(
      "sourceExcerpt must be copied from the supplied job description",
    );
    expect(interviewQuestionGenerationInstructions).toContain(
      "never claim that an employer will ask",
    );
  });
});
