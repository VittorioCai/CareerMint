import { performance } from "node:perf_hooks";

import { z } from "zod";

import type {
  AIProvider,
  AIResult,
  AIUsage,
} from "./provider";
import { jdAnalysisInstructions } from "@/features/jd-analysis/prompt";
import {
  jdAnalysisSchema,
  type JDAnalysis,
  type JobDescriptionAnalysisInput,
} from "@/features/jd-analysis/schemas";
import { resumeCustomizationInstructions } from "@/features/resume-customization/prompt";
import {
  resumeSuggestionOutputSchema,
  type ResumeGenerationInput,
  type ResumeSuggestionOutput,
} from "@/features/resume-customization/schemas";
import { interviewQuestionGenerationInstructions } from "@/features/interview-preparation/generation-prompt";
import {
  interviewQuestionGenerationOutputSchema,
  type InterviewQuestionGenerationInput,
  type InterviewQuestionGenerationOutput,
} from "@/features/interview-preparation/generation-schemas";
import { resumeGapAnalysisInstructions } from "@/features/resume-gaps/prompt";
import {
  resumeGapProviderOutputSchema,
  type ResumeGapAnalysisInput,
  type ResumeGapProviderOutput,
} from "@/features/resume-gaps/schemas";
import { resumeExtractionInstructions } from "./prompt";
import {
  resumeExtractionSchema,
  type ResumeExtraction,
} from "./schemas";

const endpoint = "https://api.deepseek.com/chat/completions";
const providerName = "deepseek";
const invalidOutputError = "resume-extraction-invalid-output";
const resumeGapInvalidOutputError = "resume-gap-invalid-output";
const resumeGapMaxTokens = 96_000;

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

const emptyUsage: AIUsage = {
  inputCacheHitTokens: 0,
  inputCacheMissTokens: 0,
  outputTokens: 0,
};

class AdapterError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryableOutput: boolean = false,
    public readonly usage: AIUsage = emptyUsage,
  ) {
    super(code);
    this.name = "AIProviderAdapterError";
  }
}

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

function addUsage(left: AIUsage, right: AIUsage): AIUsage {
  return {
    inputCacheHitTokens:
      left.inputCacheHitTokens + right.inputCacheHitTokens,
    inputCacheMissTokens:
      left.inputCacheMissTokens + right.inputCacheMissTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  };
}

const monthYearDatePattern = /^(0[1-9]|1[0-2])\/(\d{4})$/;

function normalizeResumeDate(value: unknown) {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (/^(present|current|now)$/i.test(trimmed)) return null;

  const monthYear = monthYearDatePattern.exec(trimmed);
  if (monthYear) return `${monthYear[2]}-${monthYear[1]}`;

  return value;
}

function normalizeResumeExtractionDates(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as { facts?: unknown };
  if (!Array.isArray(record.facts)) return value;

  return {
    ...record,
    facts: record.facts.map((fact) => {
      if (!fact || typeof fact !== "object" || Array.isArray(fact)) {
        return fact;
      }

      const factRecord = fact as { data?: unknown };
      if (
        !factRecord.data ||
        typeof factRecord.data !== "object" ||
        Array.isArray(factRecord.data)
      ) {
        return fact;
      }

      const data = factRecord.data as {
        startDate?: unknown;
        endDate?: unknown;
      };
      return {
        ...factRecord,
        data: {
          ...data,
          startDate: normalizeResumeDate(data.startDate),
          endDate: normalizeResumeDate(data.endDate),
        },
      };
    }),
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

function requestBody(
  model: string,
  systemInstructions: string,
  userContent: string,
  maxTokens: number,
) {
  return {
    model,
    messages: [
      { role: "system", content: systemInstructions },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    stream: false,
    max_tokens: maxTokens,
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

  async function runAttempt<Output>({
    systemInstructions,
    userContent,
    outputSchema,
    invalidOutputError,
    maxTokens,
    preprocess,
  }: {
    systemInstructions: string;
    userContent: string;
    outputSchema: z.ZodType<Output>;
    invalidOutputError: string;
    maxTokens: number;
    preprocess?: (value: unknown) => unknown;
  }): Promise<AIResult<Output>> {
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
        body: JSON.stringify(
          requestBody(model, systemInstructions, userContent, maxTokens),
        ),
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
      if (choice.finish_reason !== "stop") {
        throw new AdapterError(invalidOutputError);
      }
      if (!choice.message.content?.trim()) {
        throw new AdapterError(invalidOutputError);
      }

      let rawExtraction: unknown;
      try {
        rawExtraction = JSON.parse(choice.message.content);
      } catch {
        throw new AdapterError(invalidOutputError, true, usage);
      }

      const extraction = outputSchema.safeParse(
        preprocess ? preprocess(rawExtraction) : rawExtraction,
      );
      if (!extraction.success) {
        throw new AdapterError(invalidOutputError, true, usage);
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
            : error instanceof DOMException && error.name === "TimeoutError"
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

  async function withInvalidOutputRetry<Output>(
    run: () => Promise<AIResult<Output>>,
    invalidOutputError: string,
  ) {
    let retryUsage = emptyUsage;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await run();
        return attempt === 0
          ? result
          : { ...result, usage: addUsage(retryUsage, result.usage) };
      } catch (error) {
        if (
          error instanceof AdapterError &&
          error.retryableOutput &&
          attempt === 0
        ) {
          retryUsage = addUsage(retryUsage, error.usage);
          continue;
        }
        throw error;
      }
    }

    throw new AdapterError(invalidOutputError);
  }

  return {
    async extractResumeFacts(resumeText) {
      return withInvalidOutputRetry<ResumeExtraction>(
        () =>
          runAttempt({
            systemInstructions: resumeExtractionInstructions,
            userContent: `<resume_document>\n${resumeText}\n</resume_document>`,
            outputSchema: resumeExtractionSchema,
            invalidOutputError,
            maxTokens: 4096,
            preprocess: normalizeResumeExtractionDates,
          }),
        invalidOutputError,
      );
    },
    async analyzeJobDescription(input: JobDescriptionAnalysisInput) {
      const jdInvalidOutputError = "jd-analysis-invalid-output";
      return withInvalidOutputRetry<JDAnalysis>(
        () =>
          runAttempt({
            systemInstructions: jdAnalysisInstructions,
            userContent: [
              `<job_description>\n${input.jdText}\n</job_description>`,
              `<confirmed_career_facts>\n${JSON.stringify(input.confirmedFacts)}\n</confirmed_career_facts>`,
            ].join("\n"),
            outputSchema: jdAnalysisSchema,
            invalidOutputError: jdInvalidOutputError,
            maxTokens: 6144,
          }),
        jdInvalidOutputError,
      );
    },
    async generateResumeSuggestions(input: ResumeGenerationInput) {
      const generationInvalidOutputError = "resume-generation-invalid-output";
      return withInvalidOutputRetry<ResumeSuggestionOutput>(
        () =>
          runAttempt({
            systemInstructions: resumeCustomizationInstructions,
            userContent: [
              `<job_description>\n${input.jdText}\n</job_description>`,
              `<job_requirements>\n${JSON.stringify(input.requirements)}\n</job_requirements>`,
              `<confirmed_career_facts>\n${JSON.stringify(input.confirmedFacts)}\n</confirmed_career_facts>`,
            ].join("\n"),
            outputSchema: resumeSuggestionOutputSchema,
            invalidOutputError: generationInvalidOutputError,
            maxTokens: 6144,
          }),
        generationInvalidOutputError,
      );
    },
    async generateInterviewQuestions(input: InterviewQuestionGenerationInput) {
      const generationInvalidOutputError =
        "interview-question-generation-invalid-output";
      return withInvalidOutputRetry<InterviewQuestionGenerationOutput>(
        () =>
          runAttempt({
            systemInstructions: interviewQuestionGenerationInstructions,
            userContent: [
              `<job_description>\n${input.jdText}\n</job_description>`,
              `<job_requirements>\n${JSON.stringify(input.requirements)}\n</job_requirements>`,
              `<common_question_prompts>\n${JSON.stringify(input.commonPrompts)}\n</common_question_prompts>`,
            ].join("\n"),
            outputSchema: interviewQuestionGenerationOutputSchema,
            invalidOutputError: generationInvalidOutputError,
            maxTokens: 4096,
          }),
        generationInvalidOutputError,
      );
    },
    async analyzeResumeGaps(input: ResumeGapAnalysisInput) {
      const providerRequirements = input.requirements.map(
        ({ id, category, text, priority }) => ({
          id,
          category,
          text,
          priority,
        }),
      );
      return withInvalidOutputRetry<ResumeGapProviderOutput>(
        () =>
          runAttempt({
            systemInstructions: resumeGapAnalysisInstructions,
            userContent: [
              `<requirements_json>\n${JSON.stringify(providerRequirements)}\n</requirements_json>`,
              `<resume_document>\n${input.resumeText}\n</resume_document>`,
            ].join("\n"),
            outputSchema: resumeGapProviderOutputSchema,
            invalidOutputError: resumeGapInvalidOutputError,
            maxTokens: resumeGapMaxTokens,
          }),
        resumeGapInvalidOutputError,
      );
    },
  };
}
