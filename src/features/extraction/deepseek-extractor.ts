import { performance } from "node:perf_hooks";

import { z } from "zod";

import type {
  AIProvider,
  AIResult,
  AIUsage,
} from "./provider";
import { resumeExtractionInstructions } from "./prompt";
import {
  resumeExtractionSchema,
  type ResumeExtraction,
} from "./schemas";

const endpoint = "https://api.deepseek.com/chat/completions";
const providerName = "deepseek";
const invalidOutputError = "resume-extraction-invalid-output";

const usageSchema = z
  .object({
    prompt_cache_hit_tokens: z.number().int().nonnegative().optional(),
    prompt_cache_miss_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
  })
  .optional();

const responseEnvelopeSchema = z.object({
  id: z.string().min(1).nullable().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z.object({ content: z.string().nullable() }),
      }),
    )
    .min(1),
  usage: usageSchema,
});

export type AIMetadataLog = {
  provider: string;
  model: string;
  requestId: string | null;
  status: number | null;
  latencyMs: number;
  usage: AIUsage;
  errorCode: string | null;
};

export type MetadataLogger = {
  log(entry: AIMetadataLog): void;
};

type DeepSeekProviderOptions = {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  logger?: MetadataLogger;
};

class AdapterError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryableOutput: boolean = false,
  ) {
    super(code);
    this.name = "AIProviderAdapterError";
  }
}

const emptyUsage: AIUsage = {
  inputCacheHitTokens: 0,
  inputCacheMissTokens: 0,
  outputTokens: 0,
};

const noOpLogger: MetadataLogger = { log: () => undefined };

function mapUsage(
  usage: z.infer<typeof usageSchema>,
): AIUsage {
  return {
    inputCacheHitTokens: usage?.prompt_cache_hit_tokens ?? 0,
    inputCacheMissTokens: usage?.prompt_cache_miss_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

function httpError(status: number) {
  if (status === 401) return "ai-provider-authentication-failed";
  if (status === 429) return "ai-provider-rate-limited";
  return "ai-provider-request-failed";
}

function safeLog(logger: MetadataLogger, entry: AIMetadataLog) {
  try {
    logger.log(entry);
  } catch {
    // Metadata logging must never change extraction behavior.
  }
}

function requestBody(model: string, resumeText: string) {
  return {
    model,
    messages: [
      { role: "system", content: resumeExtractionInstructions },
      {
        role: "user",
        content: `<resume_document>\n${resumeText}\n</resume_document>`,
      },
    ],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    stream: false,
    max_tokens: 4096,
  };
}

export function createDeepSeekAIProvider(
  options: DeepSeekProviderOptions = {},
): AIProvider {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const model =
    options.model ?? process.env.AI_TEXT_MODEL ?? "deepseek-v4-flash";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const logger = options.logger ?? noOpLogger;

  if (!apiKey?.trim()) throw new Error("deepseek-api-key-missing");

  async function runAttempt(
    resumeText: string,
  ): Promise<AIResult<ResumeExtraction>> {
    const startedAt = performance.now();
    let status: number | null = null;
    let requestId: string | null = null;
    let usage = emptyUsage;

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody(model, resumeText)),
        signal: AbortSignal.timeout(30_000),
      });

      status = response.status;
      requestId = response.headers.get("x-request-id");
      if (!response.ok) throw new AdapterError(httpError(response.status));

      let rawEnvelope: unknown;
      try {
        rawEnvelope = await response.json();
      } catch {
        throw new AdapterError(invalidOutputError, true);
      }

      const envelope = responseEnvelopeSchema.safeParse(rawEnvelope);
      if (!envelope.success) {
        throw new AdapterError(invalidOutputError, true);
      }

      requestId = envelope.data.id ?? requestId;
      usage = mapUsage(envelope.data.usage);
      const choice = envelope.data.choices[0];
      if (choice.finish_reason !== "stop" || !choice.message.content?.trim()) {
        throw new AdapterError(invalidOutputError, true);
      }

      let rawExtraction: unknown;
      try {
        rawExtraction = JSON.parse(choice.message.content);
      } catch {
        throw new AdapterError(invalidOutputError, true);
      }

      const extraction = resumeExtractionSchema.safeParse(rawExtraction);
      if (!extraction.success) {
        throw new AdapterError(invalidOutputError, true);
      }

      safeLog(logger, {
        provider: providerName,
        model,
        requestId,
        status,
        latencyMs: Math.round(performance.now() - startedAt),
        usage,
        errorCode: null,
      });

      return {
        data: extraction.data,
        provider: providerName,
        model,
        requestId,
        usage,
      };
    } catch (error) {
      const adapterError =
        error instanceof AdapterError
          ? error
          : error instanceof DOMException && error.name === "AbortError"
            ? new AdapterError("ai-provider-timeout")
            : new AdapterError("ai-provider-request-failed");

      safeLog(logger, {
        provider: providerName,
        model,
        requestId,
        status,
        latencyMs: Math.round(performance.now() - startedAt),
        usage,
        errorCode: adapterError.code,
      });
      throw adapterError;
    }
  }

  return {
    async extractResumeFacts(resumeText) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await runAttempt(resumeText);
        } catch (error) {
          if (
            error instanceof AdapterError &&
            error.retryableOutput &&
            attempt === 0
          ) {
            continue;
          }
          throw error;
        }
      }

      throw new AdapterError(invalidOutputError);
    },
  };
}
