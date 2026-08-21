import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost } from "@/features/ai/pricing";
import type { AIProvider, AIUsage } from "@/features/extraction/provider";
import { ZodError } from "zod";

import {
  sanitizeInterviewQuestionGeneration,
  type InterviewQuestionGenerationCandidate,
  type InterviewQuestionGenerationInput,
} from "./generation-schemas";

export type InterviewQuestionGenerationRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type InterviewQuestionGenerationAI = {
  provider: string;
  model: string;
  requestId: string | null;
  usage: AIUsage;
  priceScheduleVersion: string | null;
};

export type InterviewQuestionGenerationRunResult = {
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  pendingCandidateCount: number;
  ai: InterviewQuestionGenerationAI;
  estimatedCost: {
    amount: number;
    currency: "USD";
    scheduleVersion: string;
    tier: "default" | "peak";
  } | null;
};

export type InterviewQuestionGenerationRun = {
  id: string;
  applicationId: string;
  userId: string;
  inputHash: string;
  schemaVersion: string;
  provider: string;
  model: string;
  status: InterviewQuestionGenerationRunStatus;
  attemptCount: number;
  result: InterviewQuestionGenerationRunResult | null;
  errorCode: string | null;
  errorMessage: string | null;
  requestId: string | null;
  createdAt: string;
};

export type InterviewQuestionGenerationCandidateRecord =
  InterviewQuestionGenerationCandidate & {
    id: string;
    runId: string;
    applicationId: string;
    status: "pending" | "accepted" | "rejected";
    questionId: string | null;
    sortOrder: number;
  };

export type CompleteInterviewQuestionGenerationInput = {
  runId: string;
  candidates: InterviewQuestionGenerationCandidate[];
  rejectedCandidateCount: number;
  aiUsage: InterviewQuestionGenerationAI;
  estimatedCost: InterviewQuestionGenerationRunResult["estimatedCost"];
  requestId: string | null;
};

export type FailInterviewQuestionGenerationInput = {
  runId: string;
  errorCode: string;
  errorMessage: string;
  requestId: string | null;
};

export type InterviewQuestionGenerationRequirements =
  InterviewQuestionGenerationInput["requirements"];

export type InterviewQuestionGenerationServiceDependencies = {
  runs: {
    claim(runId: string): Promise<boolean>;
    getOwned(
      userId: string,
      runId: string,
    ): Promise<InterviewQuestionGenerationRun | null>;
    complete(
      input: CompleteInterviewQuestionGenerationInput,
    ): Promise<InterviewQuestionGenerationRun>;
    fail(
      input: FailInterviewQuestionGenerationInput,
    ): Promise<InterviewQuestionGenerationRun>;
  };
  provider: Pick<AIProvider, "generateInterviewQuestions">;
  priceSchedule?: AIPriceSchedule;
  clock?: () => Date;
};

const safeErrorMessage = "岗位面试题生成失败，请稍后重试。";

function safeFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "deepseek-api-key-missing" || code === "ai-provider-authentication-failed") {
    return {
      errorCode: "interview-question-generation-unavailable",
      errorMessage: safeErrorMessage,
    };
  }
  if (
    code === "interview-question-generation-invalid-output" ||
    error instanceof ZodError
  ) {
    return {
      errorCode: code,
      errorMessage: safeErrorMessage,
    };
  }
  return {
    errorCode: "interview-question-generation-provider-error",
    errorMessage: safeErrorMessage,
  };
}

export function createInterviewQuestionGenerationService(
  dependencies: InterviewQuestionGenerationServiceDependencies,
) {
  const clock = dependencies.clock ?? (() => new Date());

  return {
    async run(input: {
      userId: string;
      run: InterviewQuestionGenerationRun;
      application: { id: string; jdText: string };
      requirements: InterviewQuestionGenerationRequirements;
      commonPrompts: string[];
    }): Promise<InterviewQuestionGenerationRun> {
      const claimed = await dependencies.runs.claim(input.run.id);
      if (!claimed) {
        const current = await dependencies.runs.getOwned(
          input.userId,
          input.run.id,
        );
        if (!current) throw new Error("interview-question-generation-not-found");
        return current;
      }

      let requestId: string | null = null;
      try {
        const aiResult = await dependencies.provider.generateInterviewQuestions({
          jdText: input.application.jdText,
          requirements: input.requirements,
          commonPrompts: input.commonPrompts,
        });
        requestId = aiResult.requestId;
        const sanitized = sanitizeInterviewQuestionGeneration({
          jdText: input.application.jdText,
          requirements: input.requirements,
          commonPrompts: input.commonPrompts,
          output: aiResult.data,
        });
        const scheduleMatches =
          dependencies.priceSchedule?.provider === aiResult.provider &&
          dependencies.priceSchedule.model === aiResult.model;
        const estimatedCost = scheduleMatches
          ? estimateAITextCost(aiResult.usage, dependencies.priceSchedule!, clock())
          : null;

        return await dependencies.runs.complete({
          runId: input.run.id,
          candidates: sanitized.questions,
          rejectedCandidateCount: sanitized.rejectedQuestionCount,
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
          requestId: aiResult.requestId,
        });
      } catch (error) {
        return dependencies.runs.fail({
          runId: input.run.id,
          ...safeFailure(error),
          requestId,
        });
      }
    },
  };
}
