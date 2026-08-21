// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createFakeInterviewQuestionProvider,
  selectInterviewQuestionProviderConfiguration,
  takeInterviewQuestionExcerpt,
} from "./generation-fake";

describe("interview generation fake provider", () => {
  it("takes 240 Unicode code points without splitting a surrogate pair", () => {
    const value = `${"😀".repeat(240)}tail`;
    const excerpt = takeInterviewQuestionExcerpt(value);

    expect(Array.from(excerpt)).toHaveLength(240);
    expect(excerpt.endsWith("😀")).toBe(true);
    expect(excerpt).not.toContain("tail");
  });

  it("returns fake metadata matching the JD-derived excerpt", async () => {
    const provider = createFakeInterviewQuestionProvider();
    const jdText = "😀".repeat(240) + " unsupported tail";

    const result = await provider.generateInterviewQuestions({
      jdText,
      requirements: [],
      commonPrompts: [],
    });

    expect(result.provider).toBe("fake");
    expect(result.model).toBe("fake-interview-question-generator-v1");
    expect(result.data.questions[0]?.sourceExcerpt).toBe(
      "😀".repeat(240),
    );
  });

  it("keeps the fake provider disabled in production", () => {
    expect(
      selectInterviewQuestionProviderConfiguration({
        fakeExtractor: true,
        production: true,
        provider: "deepseek",
        model: "deepseek-v4-flash",
      }),
    ).toEqual({ provider: "deepseek", model: "deepseek-v4-flash" });
    expect(
      selectInterviewQuestionProviderConfiguration({
        fakeExtractor: true,
        production: false,
        provider: "deepseek",
        model: "deepseek-v4-flash",
      }),
    ).toEqual({
      provider: "fake",
      model: "fake-interview-question-generator-v1",
    });
  });
});
