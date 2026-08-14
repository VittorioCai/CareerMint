import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost } from "@/features/ai/pricing";
import type { AIProvider } from "@/features/extraction/provider";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import {
  sanitizeResumeSuggestions,
  type ResumeGenerationRun,
  type ResumeGenerationRunResult,
  type ResumeRequirementContext,
  type ResumeSuggestion,
} from "./schemas";

export type CompleteResumeGenerationInput = {
  runId: string;
  suggestions: ResumeSuggestion[];
  rejectedSuggestionCount: number;
  rejectedReferenceCount: number;
  aiUsage: ResumeGenerationRunResult["ai"];
  estimatedCost: ResumeGenerationRunResult["estimatedCost"];
};

export type FailResumeGenerationInput = {
  runId: string;
  errorCode: string;
  errorMessage: string;
};

type RunRepository = {
  claim(runId: string): Promise<boolean>;
  getOwned(userId: string, runId: string): Promise<ResumeGenerationRun | null>;
  complete(input: CompleteResumeGenerationInput): Promise<ResumeGenerationRun>;
  fail(input: FailResumeGenerationInput): Promise<ResumeGenerationRun>;
};

type ResumeGenerationServiceDependencies = {
  runs: RunRepository;
  provider: Pick<AIProvider, "generateResumeSuggestions">;
  priceSchedule?: AIPriceSchedule;
  clock?: () => Date;
};

const safeProviderErrors = new Set([
  "ai-provider-rate-limited",
  "ai-provider-request-failed",
  "ai-provider-timeout",
  "resume-generation-invalid-output",
]);

function safeFailure(error: unknown) {
  const candidate = error instanceof Error ? error.message : "";
  if (
    candidate === "deepseek-api-key-missing" ||
    candidate === "ai-provider-authentication-failed"
  ) {
    return {
      errorCode: "resume-generation-unavailable",
      errorMessage: "简历建议暂不可用，现有版本和事实都已安全保留。",
    };
  }
  return {
    errorCode: safeProviderErrors.has(candidate)
      ? candidate
      : "resume-generation-failed",
    errorMessage: "简历建议生成失败，请稍后重试。",
  };
}

export function createResumeGenerationService(
  dependencies: ResumeGenerationServiceDependencies,
) {
  const clock = dependencies.clock ?? (() => new Date());

  return {
    async run(input: {
      userId: string;
      run: ResumeGenerationRun;
      application: { id: string; jdText: string };
      confirmedFacts: ConfirmedFactForAnalysis[];
      requirements: ResumeRequirementContext[];
    }): Promise<ResumeGenerationRun> {
      const claimed = await dependencies.runs.claim(input.run.id);
      if (!claimed) {
        const current = await dependencies.runs.getOwned(
          input.userId,
          input.run.id,
        );
        if (!current) throw new Error("resume-generation-not-found");
        return current;
      }

      try {
        const aiResult = await dependencies.provider.generateResumeSuggestions({
          jdText: input.application.jdText,
          confirmedFacts: input.confirmedFacts,
          requirements: input.requirements,
        });
        const sanitized = sanitizeResumeSuggestions({
          confirmedFacts: input.confirmedFacts,
          requirements: input.requirements,
          output: aiResult.data,
        });
        const scheduleMatches =
          dependencies.priceSchedule?.provider === aiResult.provider &&
          dependencies.priceSchedule.model === aiResult.model;
        const estimatedCost = scheduleMatches
          ? estimateAITextCost(
              aiResult.usage,
              dependencies.priceSchedule!,
              clock(),
            )
          : null;

        return await dependencies.runs.complete({
          runId: input.run.id,
          suggestions: sanitized.suggestions,
          rejectedSuggestionCount: sanitized.rejectedSuggestionCount,
          rejectedReferenceCount: sanitized.rejectedReferenceCount,
          aiUsage: {
            provider: aiResult.provider,
            model: aiResult.model,
            requestId: aiResult.requestId,
            usage: aiResult.usage,
            priceScheduleVersion: scheduleMatches
              ? dependencies.priceSchedule!.version
              : null,
          },
          estimatedCost,
        });
      } catch (error) {
        return dependencies.runs.fail({
          runId: input.run.id,
          ...safeFailure(error),
        });
      }
    },
  };
}
