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
import {
  jdStructureInstructions,
  selectComparisonPromptVariant,
  type ComparisonPromptVariant,
} from "@/features/jd-gap-analysis/prompts";
import {
  jdGapComparisonOutputSchema,
  jdStructureProviderOutputSchema,
  type JDGapComparisonInput,
  type JDGapComparisonOutput,
  type JDStructureInput,
  type JDStructureProviderOutput,
} from "@/features/jd-gap-analysis/schemas";
import {
  differencePromptVariants,
  type DifferencePromptVariant,
} from "@/features/resume-jd-difference/prompts";
import { type ResumeJDDifferenceInput } from "@/features/resume-jd-difference/schemas";
import {
  buildSourceSegments,
  materializeResumeJDDifferenceOutput,
  repairProviderOutput,
  resumeJDDifferenceProviderOutputSchema,
  type DifferenceSourceSegment,
  type ResumeJDDifferenceProviderOutput,
} from "@/features/resume-jd-difference/provider-output";
import { resumeExtractionInstructions } from "./prompt";
import {
  resumeExtractionSchema,
  type ResumeExtraction,
} from "./schemas";

const endpoint = "https://api.deepseek.com/chat/completions";
const responsesEndpoint = "https://api.deepseek.com/responses";
const providerName = "deepseek";
const invalidOutputError = "resume-extraction-invalid-output";
const resumeGapInvalidOutputError = "resume-gap-invalid-output";
const resumeGapMaxTokens = 96_000;
const jdStructureInvalidOutputError = "jd-structure-invalid-output";
const jdGapInvalidOutputError = "jd-gap-invalid-output";
const jdGapV3MaxTokens = 8192;
const resumeJDDifferenceInvalidOutputError =
  "resume-jd-difference-invalid-output";
const resumeJDDifferenceMaxTokens = 8192;

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

const responsesEnvelopeSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["in_progress", "completed", "incomplete", "failed"]),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(
          z.object({
            type: z.string(),
            text: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      input_tokens_details: z
        .object({ cached_tokens: z.number().int().nonnegative().optional() })
        .optional(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

export type AIMetadataLog = {
  provider: string;
  model: string;
  requestId: string | null;
  status: number | null;
  latencyMs: number;
  usage: AIUsage;
  errorCode: string | null;
  failureStage?: string | null;
};

export type MetadataLogger = {
  log(entry: AIMetadataLog): void;
};

type DeepSeekProviderOptions = {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  logger?: MetadataLogger;
  jdGapMaxTokens?: number;
  resumeJDDifferenceMaxTokens?: number;
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
    public readonly failureStage: string | null = null,
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

function schemaFailureStage(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "content-schema";
  const code = issue.code.replaceAll("_", "-");
  const path = issue.path
    .map((part) => String(part))
    .join("-")
    .replaceAll(/[^A-Za-z0-9-]/gu, "-")
    .slice(0, 48);
  return `content-schema:${code}${path ? `:${path}` : ""}`.slice(0, 80);
}

function escapeControlCharsInStrings(value: string) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      out += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      out += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      out += character;
      continue;
    }
    const code = character.codePointAt(0) ?? 0;
    if (inString && code < 0x20) {
      out += code === 10 ? "\\n" : code === 13 ? "\\r" : code === 9 ? "\\t" : "";
      continue;
    }
    out += character;
  }
  return out;
}

function parseStructuredContent(content: string) {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed)?.[1]?.trim();
  const base = fenced ?? trimmed;
  for (const candidate of new Set([
    trimmed,
    fenced,
    escapeControlCharsInStrings(base),
  ])) {
    if (!candidate) continue;
    try {
      return { ok: true as const, value: JSON.parse(candidate) as unknown };
    } catch {
      // Try the next deterministic unwrapping without repairing content.
    }
  }
  return { ok: false as const };
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

type JSONSchemaNode = Record<string, unknown>;

function asJSONSchemaNode(value: unknown): JSONSchemaNode | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JSONSchemaNode)
    : null;
}

function resumeJDDifferenceProviderJSONSchema(
  jdSegments: DifferenceSourceSegment[],
  resumeSegments: DifferenceSourceSegment[],
) {
  const schema = asJSONSchemaNode(
    z.toJSONSchema(resumeJDDifferenceProviderOutputSchema),
  );
  const items = asJSONSchemaNode(
    asJSONSchemaNode(asJSONSchemaNode(schema?.properties)?.requirements)?.items,
  );
  const itemProperties = asJSONSchemaNode(items?.properties);
  const jdSegmentId = asJSONSchemaNode(itemProperties?.jdSegmentId);
  const resumeSegmentId = asJSONSchemaNode(itemProperties?.resumeSegmentId);
  const resumeString = (
    Array.isArray(resumeSegmentId?.anyOf) ? resumeSegmentId.anyOf : []
  )
    .map(asJSONSchemaNode)
    .find((variant) => variant?.type === "string");
  if (!schema || !jdSegmentId || !resumeString) {
    throw new AdapterError(
      resumeJDDifferenceInvalidOutputError,
      false,
      emptyUsage,
      "source-reference-schema",
    );
  }
  jdSegmentId.enum = jdSegments.map(({ id }) => id);
  resumeString.enum = resumeSegments.map(({ id }) => id);
  return schema;
}

function responsesRequestBody(
  model: string,
  instructions: string,
  input: string,
  maxOutputTokens: number,
  schema: z.ZodType,
  jsonSchema?: JSONSchemaNode,
) {
  return {
    model,
    instructions,
    input,
    reasoning: { effort: "none" },
    text: {
      format: {
        type: "json_schema",
        name: "resume_jd_difference",
        schema: jsonSchema ?? z.toJSONSchema(schema),
      },
    },
    stream: false,
    max_output_tokens: maxOutputTokens,
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
  const configuredJDGapMaxTokens =
    options.jdGapMaxTokens ?? jdGapV3MaxTokens;
  const configuredResumeJDDifferenceMaxTokens =
    options.resumeJDDifferenceMaxTokens ?? resumeJDDifferenceMaxTokens;

  if (!apiKey?.trim()) throw new Error("deepseek-api-key-missing");
  if (
    !Number.isInteger(configuredJDGapMaxTokens) ||
    configuredJDGapMaxTokens < 1 ||
    configuredJDGapMaxTokens > jdGapV3MaxTokens
  ) {
    throw new Error("deepseek-jd-gap-max-tokens-invalid");
  }
  if (
    !Number.isInteger(configuredResumeJDDifferenceMaxTokens) ||
    configuredResumeJDDifferenceMaxTokens < 1 ||
    configuredResumeJDDifferenceMaxTokens > resumeJDDifferenceMaxTokens
  ) {
    throw new Error("deepseek-resume-jd-difference-max-tokens-invalid");
  }

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
        throw new AdapterError(invalidOutputError, true, emptyUsage, "envelope-json");
      }

      const envelope = responseEnvelopeSchema.safeParse(rawEnvelope);
      if (!envelope.success) {
        throw new AdapterError(
          invalidOutputError,
          true,
          emptyUsage,
          "envelope-schema",
        );
      }

      requestId = envelope.data.id ?? requestId;
      usage = mapUsage(envelope.data.usage);
      const choice = envelope.data.choices[0];
      if (choice.finish_reason !== "stop") {
        throw new AdapterError(
          invalidOutputError,
          false,
          usage,
          "finish-reason",
        );
      }
      if (!choice.message.content?.trim()) {
        throw new AdapterError(
          invalidOutputError,
          false,
          usage,
          "empty-content",
        );
      }

      let rawExtraction: unknown;
      try {
        rawExtraction = JSON.parse(choice.message.content);
      } catch {
        throw new AdapterError(invalidOutputError, true, usage, "content-json");
      }

      const extraction = outputSchema.safeParse(
        preprocess ? preprocess(rawExtraction) : rawExtraction,
      );
      if (!extraction.success) {
        throw new AdapterError(
          invalidOutputError,
          true,
          usage,
          schemaFailureStage(extraction.error),
        );
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
        failureStage: adapterError.failureStage,
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

  async function runStructuredResponseAttempt<Output>({
    systemInstructions,
    userContent,
    outputSchema,
    invalidOutputError,
    maxTokens,
    jsonSchema,
    preprocess,
  }: {
    systemInstructions: string;
    userContent: string;
    outputSchema: z.ZodType<Output>;
    invalidOutputError: string;
    maxTokens: number;
    jsonSchema?: JSONSchemaNode;
    preprocess?: (value: unknown) => unknown;
  }): Promise<AIResult<Output>> {
    const startedAt = performance.now();
    let status: number | null = null;
    let requestId: string | null = null;
    let usage = emptyUsage;

    try {
      const response = await fetchImpl(responsesEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(
          responsesRequestBody(
            model,
            systemInstructions,
            userContent,
            maxTokens,
            outputSchema,
            jsonSchema,
          ),
        ),
        signal: AbortSignal.timeout(50_000),
      });

      status = response.status;
      requestId = response.headers.get("x-request-id");
      if (!response.ok) throw new AdapterError(httpError(response.status));

      let rawEnvelope: unknown;
      try {
        rawEnvelope = await response.json();
      } catch {
        throw new AdapterError(
          invalidOutputError,
          false,
          emptyUsage,
          "envelope-json",
        );
      }

      const envelope = responsesEnvelopeSchema.safeParse(rawEnvelope);
      if (!envelope.success) {
        throw new AdapterError(
          invalidOutputError,
          false,
          emptyUsage,
          "envelope-schema",
        );
      }

      requestId = envelope.data.id;
      const cachedTokens =
        envelope.data.usage?.input_tokens_details?.cached_tokens ?? 0;
      usage = {
        inputCacheHitTokens: cachedTokens,
        inputCacheMissTokens: Math.max(
          0,
          (envelope.data.usage?.input_tokens ?? 0) - cachedTokens,
        ),
        outputTokens: envelope.data.usage?.output_tokens ?? 0,
      };

      if (envelope.data.status === "failed") {
        throw new AdapterError(
          "ai-provider-request-failed",
          false,
          usage,
          "response-failed",
        );
      }
      if (envelope.data.status !== "completed") {
        throw new AdapterError(
          invalidOutputError,
          false,
          usage,
          "response-incomplete",
        );
      }

      const content = envelope.data.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!content) {
        throw new AdapterError(
          invalidOutputError,
          false,
          usage,
          "empty-content",
        );
      }

      const parsedContent = parseStructuredContent(content);
      if (!parsedContent.ok) {
        throw new AdapterError(
          invalidOutputError,
          false,
          usage,
          "content-json",
        );
      }

      const extraction = outputSchema.safeParse(
        preprocess ? preprocess(parsedContent.value) : parsedContent.value,
      );
      if (!extraction.success) {
        throw new AdapterError(
          invalidOutputError,
          false,
          usage,
          schemaFailureStage(extraction.error),
        );
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
        failureStage: adapterError.failureStage,
      });
      throw adapterError;
    }
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
    async structureJobDescription(input: JDStructureInput) {
      return withInvalidOutputRetry<JDStructureProviderOutput>(
        () =>
          runAttempt({
            systemInstructions: jdStructureInstructions,
            userContent: `<job_description>\n${input.jdText}\n</job_description>`,
            outputSchema: jdStructureProviderOutputSchema,
            invalidOutputError: jdStructureInvalidOutputError,
            maxTokens: configuredJDGapMaxTokens,
          }),
        jdStructureInvalidOutputError,
      );
    },
    async compareJDGapCriteria(
      input: JDGapComparisonInput,
      options: { promptVariant: ComparisonPromptVariant },
    ) {
      const prompt = selectComparisonPromptVariant(options.promptVariant);
      return withInvalidOutputRetry<JDGapComparisonOutput>(
        () =>
          runAttempt({
            systemInstructions: prompt.instructions,
            userContent: [
              `<requirements_json>\n${JSON.stringify(input.requirements)}\n</requirements_json>`,
              `<resume_document>\n${input.resumeText}\n</resume_document>`,
              `<confirmed_career_facts>\n${JSON.stringify(input.confirmedFacts)}\n</confirmed_career_facts>`,
            ].join("\n"),
            outputSchema: jdGapComparisonOutputSchema,
            invalidOutputError: jdGapInvalidOutputError,
            maxTokens: configuredJDGapMaxTokens,
          }),
        jdGapInvalidOutputError,
      );
    },
    async analyzeResumeJDDifference(
      input: ResumeJDDifferenceInput,
      options: { promptVariant: DifferencePromptVariant },
    ) {
      const prompt = differencePromptVariants[options.promptVariant];
      const jdSegments = buildSourceSegments(input.jdText, "jd");
      const resumeSegments = buildSourceSegments(input.resumeText, "resume");
      if (jdSegments.length === 0) {
        throw new AdapterError(
          resumeJDDifferenceInvalidOutputError,
          false,
          emptyUsage,
          "source-segments-empty",
        );
      }
      const compact =
        await runStructuredResponseAttempt<ResumeJDDifferenceProviderOutput>({
          systemInstructions: prompt.instructions,
          userContent: [
            `<job_description_segments_json>\n${JSON.stringify(jdSegments)}\n</job_description_segments_json>`,
            `<selected_resume_segments_json>\n${JSON.stringify(resumeSegments)}\n</selected_resume_segments_json>`,
            `<confirmed_career_facts>\n${JSON.stringify(input.confirmedFacts)}\n</confirmed_career_facts>`,
          ].join("\n"),
          outputSchema: resumeJDDifferenceProviderOutputSchema,
          invalidOutputError: resumeJDDifferenceInvalidOutputError,
          maxTokens: configuredResumeJDDifferenceMaxTokens,
          jsonSchema: resumeJDDifferenceProviderJSONSchema(
            jdSegments,
            resumeSegments,
          ),
          preprocess: repairProviderOutput,
        });
      try {
        return {
          ...compact,
          data: materializeResumeJDDifferenceOutput(compact.data, {
            jdSegments,
            resumeSegments,
            confirmedFactIds: new Set(input.confirmedFacts.map(({ id }) => id)),
          }),
        };
      } catch {
        throw new AdapterError(
          resumeJDDifferenceInvalidOutputError,
          false,
          compact.usage,
          "source-reference",
        );
      }
    },
  };
}
