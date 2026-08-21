// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

  it("returns two distinct JD-grounded candidates with zero token usage", async () => {
    const provider = createFakeInterviewQuestionProvider();
    const jdText =
      "Lead product discovery, partner with engineering, define strategy, and measure customer outcomes across international markets.";

    const result = await provider.generateInterviewQuestions({
      jdText,
      requirements: [],
      commonPrompts: [],
    });

    expect(result.provider).toBe("fake");
    expect(result.model).toBe("fake-interview-question-generator-v1");
    expect(result.data.questions).toHaveLength(2);
    expect(new Set(result.data.questions.map((question) => question.prompt)).size).toBe(2);
    expect(new Set(result.data.questions.map((question) => question.sourceExcerpt)).size).toBe(1);
    expect(result.data.questions.every((question) => question.sourceExcerpt === jdText)).toBe(true);
    expect(result.data.questions.every((question) => question.relevanceReason.length > 0)).toBe(true);
    expect(result.usage).toEqual({
      inputCacheHitTokens: 0,
      inputCacheMissTokens: 0,
      outputTokens: 0,
    });
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
