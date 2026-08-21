// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createDeepSeekAIProvider } from "./deepseek-extractor";
import { resumeExtractionInstructions } from "./prompt";
import { jdAnalysisInstructions } from "@/features/jd-analysis/prompt";
import { resumeCustomizationInstructions } from "@/features/resume-customization/prompt";
import { interviewQuestionGenerationInstructions } from "@/features/interview-preparation/generation-prompt";

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

function successResponse(
  content = JSON.stringify(extraction),
  finishReason = "stop",
) {
  return new Response(
    JSON.stringify({
      id: "request-123",
      choices: [
        {
          finish_reason: finishReason,
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

  it("does not retry an empty stopped response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(successResponse(""));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.extractResumeFacts(resumeText)).rejects.toThrow(
      "resume-extraction-invalid-output",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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

  it("maps a TimeoutError DOMException to a non-retryable timeout", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.extractResumeFacts(resumeText)).rejects.toThrow(
      "ai-provider-timeout",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["content_filter", "resume-extraction-invalid-output"],
    ["length", "resume-extraction-invalid-output"],
    ["tool_calls", "resume-extraction-invalid-output"],
  ])("does not retry finish_reason %s", async (finishReason, errorCode) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse(JSON.stringify(extraction), finishReason));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.extractResumeFacts(resumeText)).rejects.toThrow(errorCode);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("DeepSeek JD analyzer", () => {
  const input = {
    jdText:
      "Lead product discovery across international markets. Advanced SQL is required.",
    confirmedFacts: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        factType: "achievement" as const,
        title: "Checkout conversion improvement",
        organization: "Acme GmbH",
        description: "Improved checkout conversion by 18%.",
        skills: ["SQL"],
        sourceExcerpt: "Improved checkout conversion by 18%.",
      },
    ],
  };
  const analysis = {
    requirements: [
      {
        category: "skill",
        text: "Advanced SQL",
        sourceExcerpt: "Advanced SQL is required.",
        priority: "core",
        matchStatus: "partial",
        matchReason: "The confirmed achievement lists SQL.",
        matchedFactIds: ["11111111-1111-4111-8111-111111111111"],
      },
    ],
  };

  it("uses the stable JD prompt and returns structured analysis metadata", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse(JSON.stringify(analysis)));
    const { provider, log } = createProvider(fetchImpl);

    const result = await provider.analyzeJobDescription(input);

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.messages[0]).toEqual({
      role: "system",
      content: jdAnalysisInstructions,
    });
    expect(body.messages[1].content).toContain(
      `<job_description>\n${input.jdText}\n</job_description>`,
    );
    expect(body.messages[1].content).toContain(input.confirmedFacts[0].id);
    expect(result).toMatchObject({
      data: analysis,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: "request-123",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(input.jdText);
    expect(JSON.stringify(log.mock.calls)).not.toContain("Checkout conversion");
  });

  it("retries invalid JD output once with a stable error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse('{"requirements":['));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.analyzeJobDescription(input)).rejects.toThrow(
      "jd-analysis-invalid-output",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["content_filter", JSON.stringify(analysis)],
    ["length", JSON.stringify(analysis)],
    ["stop", ""],
  ])("does not retry JD terminal output %s", async (finishReason, content) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse(content, finishReason));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.analyzeJobDescription(input)).rejects.toThrow(
      "jd-analysis-invalid-output",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

});

describe("DeepSeek resume customizer", () => {
  const input = {
    jdText: "Advanced SQL is required for funnel analysis.",
    confirmedFacts: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        factType: "achievement" as const,
        title: "Checkout conversion improvement",
        organization: "Acme GmbH",
        description: "Improved checkout conversion by 18%.",
        skills: ["SQL"],
        sourceExcerpt: "Improved checkout conversion by 18%.",
      },
    ],
    requirements: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        category: "skill" as const,
        text: "Advanced SQL",
        priority: "core" as const,
      },
    ],
  };
  const output = {
    suggestions: [
      {
        section: "achievement",
        content:
          "Improved checkout conversion by 18% through SQL-led funnel analysis.",
        reason: "Highlights evidence relevant to the core SQL requirement.",
        factIds: [input.confirmedFacts[0].id],
        requirementIds: [input.requirements[0].id],
      },
    ],
  };

  it("uses a stable safety prompt and returns structured suggestion metadata", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse(JSON.stringify(output)));
    const { provider, log } = createProvider(fetchImpl);

    const result = await provider.generateResumeSuggestions(input);

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ max_tokens: 6144 });
    expect(body.messages[0]).toEqual({
      role: "system",
      content: resumeCustomizationInstructions,
    });
    expect(body.messages[1].content).toContain(
      `<job_description>\n${input.jdText}\n</job_description>`,
    );
    expect(body.messages[1].content).toContain(input.confirmedFacts[0].id);
    expect(body.messages[1].content).toContain(input.requirements[0].id);
    expect(result).toMatchObject({
      data: output,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: "request-123",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(input.jdText);
    expect(JSON.stringify(log.mock.calls)).not.toContain("checkout conversion");
  });

  it("retries invalid suggestion output once with a stable error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse('{"suggestions":['));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.generateResumeSuggestions(input)).rejects.toThrow(
      "resume-generation-invalid-output",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("DeepSeek interview question generator", () => {
  const input = {
    jdText: "Advanced SQL is required for funnel analysis.",
    requirements: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        category: "skill",
        text: "Advanced SQL",
        sourceExcerpt: "Advanced SQL is required for funnel analysis.",
        priority: "core",
      },
    ],
    commonPrompts: ["Why this role?"],
  };
  const output = {
    questions: [
      {
        category: "function",
        prompt: "How would you improve funnel analysis for this role?",
        sourceExcerpt: "Advanced SQL is required for funnel analysis.",
        relevanceReason: "It explores the role's SQL requirement.",
      },
    ],
  };

  it("uses JSON mode, disabled thinking, fixed prompt, narrow input, and metadata", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse(JSON.stringify(output)));
    const { provider, log } = createProvider(fetchImpl);

    const result = await provider.generateInterviewQuestions(input);

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      stream: false,
      max_tokens: 4096,
    });
    expect(body.messages[0]).toEqual({
      role: "system",
      content: interviewQuestionGenerationInstructions,
    });
    expect(body.messages[1].content).toContain(
      `<job_description>\n${input.jdText}\n</job_description>`,
    );
    expect(body.messages[1].content).toContain(input.requirements[0].id);
    expect(body.messages[1].content).toContain("Why this role?");
    expect(body.messages[1].content).not.toContain("confirmed_career_facts");
    expect(body.messages[1].content).not.toContain("resume_document");
    expect(result).toMatchObject({
      data: output,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: "request-123",
      usage: {
        inputCacheHitTokens: 10,
        inputCacheMissTokens: 20,
        outputTokens: 30,
      },
    });
    expect(interviewQuestionGenerationInstructions).toContain("possible");
    const serializedLogs = JSON.stringify(log.mock.calls);
    expect(serializedLogs).not.toContain(input.jdText);
    expect(serializedLogs).not.toContain(output.questions[0].prompt);
    expect(serializedLogs).not.toContain("Return one JSON object");
  });

  it.each([
    ["malformed JSON", '{"questions":['],
    ["invalid provider schema", '{"questions":[{"category":"common"}]}'],
  ])("retries %s exactly once", async (_case, invalidContent) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(successResponse(invalidContent))
      .mockResolvedValueOnce(successResponse(JSON.stringify(output)));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.generateInterviewQuestions(input)).resolves.toMatchObject({
      data: output,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns a stable error after a second invalid output", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse('{"questions":['));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.generateInterviewQuestions(input)).rejects.toThrow(
      "interview-question-generation-invalid-output",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry schema-valid output for grounding decisions", async () => {
    const schemaValidButUngrounded = {
      questions: [
        {
          ...output.questions[0],
          sourceExcerpt: "This evidence is not in the supplied JD.",
        },
      ],
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse(JSON.stringify(schemaValidButUngrounded)));
    const { provider } = createProvider(fetchImpl);

    await expect(provider.generateInterviewQuestions(input)).resolves.toMatchObject({
      data: schemaValidButUngrounded,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["content_filter", JSON.stringify(output)],
    ["length", JSON.stringify(output)],
    ["stop", ""],
  ])(
    "does not retry interview terminal output %s",
    async (finishReason, content) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(successResponse(content, finishReason));
      const { provider } = createProvider(fetchImpl);

      await expect(provider.generateInterviewQuestions(input)).rejects.toThrow(
        "interview-question-generation-invalid-output",
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );
});
