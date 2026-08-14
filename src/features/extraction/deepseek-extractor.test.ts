// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createDeepSeekAIProvider } from "./deepseek-extractor";
import { resumeExtractionInstructions } from "./prompt";

const resumeText =
  "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";

const extraction = {
  facts: [
    {
      factType: "achievement",
      data: {
        title: "Checkout conversion improvement",
        organization: null,
        startDate: null,
        endDate: null,
        description:
          "Improved checkout conversion by 18% through funnel analysis.",
        skills: [],
      },
      sourceExcerpt:
        "Improved checkout conversion by 18% through funnel analysis.",
      needsDetailReason: null,
    },
  ],
};

function successResponse(content = JSON.stringify(extraction)) {
  return new Response(
    JSON.stringify({
      id: "request-123",
      choices: [
        {
          finish_reason: "stop",
          message: { content },
        },
      ],
      usage: {
        prompt_cache_hit_tokens: 10,
        prompt_cache_miss_tokens: 20,
        completion_tokens: 30,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function createProvider(fetchImpl: typeof fetch, log = vi.fn()) {
  return {
    provider: createDeepSeekAIProvider({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      fetchImpl,
      logger: { log },
    }),
    log,
  };
}

describe("DeepSeek resume extractor", () => {
  it("sends stable JSON instructions and maps metadata without logging content", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(successResponse());
    const { provider, log } = createProvider(fetchImpl);

    const result = await provider.extractResumeFacts(resumeText);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      stream: false,
      max_tokens: 4096,
    });
    expect(body.messages[0]).toEqual({
      role: "system",
      content: resumeExtractionInstructions,
    });
    expect(body.messages[1].content).toContain(
      `<resume_document>\n${resumeText}\n</resume_document>`,
    );
    expect(result).toEqual({
      data: extraction,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: "request-123",
      usage: {
        inputCacheHitTokens: 10,
        inputCacheMissTokens: 20,
        outputTokens: 30,
      },
    });

    const serializedLogs = JSON.stringify(log.mock.calls);
    expect(serializedLogs).not.toContain("test-key");
    expect(serializedLogs).not.toContain("Product Analyst");
    expect(serializedLogs).not.toContain("checkout conversion");
    expect(serializedLogs).not.toContain("Return one JSON object");
  });

  it.each([
    [401, "ai-provider-authentication-failed"],
    [429, "ai-provider-rate-limited"],
    [503, "ai-provider-request-failed"],
  ])("maps HTTP %s to %s without retrying", async (status, errorCode) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("provider body", { status }));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.extractResumeFacts(resumeText)).rejects.toThrow(
      errorCode,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["empty", ""],
    ["truncated", '{"facts":['],
    ["invalid schema", '{"facts":[{"unsupported":true}]}'],
  ])("retries %s output exactly once", async (_case, invalidContent) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(successResponse(invalidContent))
      .mockResolvedValueOnce(successResponse());
    const { provider } = createProvider(fetchImpl);

    await expect(provider.extractResumeFacts(resumeText)).resolves.toMatchObject({
      data: extraction,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns a stable error after a second invalid output", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse('{"facts":['));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.extractResumeFacts(resumeText)).rejects.toThrow(
      "resume-extraction-invalid-output",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps an aborted request to a timeout error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.extractResumeFacts(resumeText)).rejects.toThrow(
      "ai-provider-timeout",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
