// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createDeepSeekAIProvider } from "./deepseek-extractor";

describe("AIProvider resume JD difference capability", () => {
  it("exposes the one-call V4 analysis method", () => {
    const provider = createDeepSeekAIProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn<typeof fetch>(),
    });

    expect(provider.analyzeResumeJDDifference).toBeTypeOf("function");
  });
});
