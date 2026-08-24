import { describe, expect, it } from "vitest";

import { jdAnalysisInstructions } from "./prompt";

describe("JD analysis prompt", () => {
  it("requests structure, matching, and Chinese translations in one JSON response", () => {
    expect(jdAnalysisInstructions).toContain('"jdTranslationZh":"完整 JD 的中文翻译"');
    expect(jdAnalysisInstructions).toContain('"translationZh":"该要求的中文翻译"');
    expect(jdAnalysisInstructions).toContain("one provider response");
    expect(jdAnalysisInstructions).toContain("preserve the original meaning");
  });
});
