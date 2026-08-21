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
  updatedAt: string;
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
  expectedAttemptCount: number;
  candidates: InterviewQuestionGenerationCandidate[];
  rejectedCandidateCount: number;
  aiUsage: InterviewQuestionGenerationAI;
  estimatedCost: InterviewQuestionGenerationRunResult["estimatedCost"];
  requestId: string | null;
};

export type FailInterviewQuestionGenerationInput = {
  runId: string;
  expectedAttemptCount: number;
  errorCode: string;
  errorMessage: string;
  requestId: string | null;
};

export type InterviewQuestionGenerationRequirements =
  InterviewQuestionGenerationInput["requirements"];

export type InterviewQuestionGenerationServiceDependencies = {
  runs: {
    claim(
      runId: string,
      expectedAttemptCount: number,
      expectedStatus: Exclude<InterviewQuestionGenerationRunStatus, "succeeded">,
    ): Promise<boolean>;
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
  providerFactory(): Pick<AIProvider, "generateInterviewQuestions">;
  priceSchedule?: AIPriceSchedule;
  clock?: () => Date;
};

export type InterviewQuestionGenerationServiceResult = {
  run: InterviewQuestionGenerationRun;
  reused: boolean;
};

const safeErrorMessage = "岗位面试题生成失败，请稍后重试。";
const requestIdPattern = /^[A-Za-z0-9._:-]{1,200}$/;

export function sanitizeInterviewQuestionGenerationRequestId(
  requestId: string | null | undefined,
) {
  if (typeof requestId !== "string") return null;
  const trimmed = requestId.trim();
  return requestIdPattern.test(trimmed) ? trimmed : null;
}

function safeFailure(error: unknown) {
  if (error instanceof ZodError) {
    return {
      errorCode: "interview-question-generation-invalid-output",
      errorMessage: safeErrorMessage,
    };
  }
  const code = error instanceof Error ? error.message : "";
  if (code === "deepseek-api-key-missing" || code === "ai-provider-authentication-failed") {
    return {
      errorCode: "interview-question-generation-unavailable",
      errorMessage: safeErrorMessage,
    };
  }
  if (code === "interview-question-generation-invalid-output") {
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

function isTerminal(run: InterviewQuestionGenerationRun) {
  return run.status === "succeeded" || run.status === "failed";
}

function storageFailure() {
  return new Error("interview-question-generation-storage-error");
}

async function failWithRecovery(
  dependencies: InterviewQuestionGenerationServiceDependencies,
  userId: string,
  input: FailInterviewQuestionGenerationInput,
) {
  const write = async () => dependencies.runs.fail(input);
  try {
    return { run: await write(), reused: false };
  } catch {
    let current: InterviewQuestionGenerationRun | null;
    try {
      current = await dependencies.runs.getOwned(userId, input.runId);
    } catch {
      throw storageFailure();
    }
    if (
      current &&
      (isTerminal(current) || current.attemptCount !== input.expectedAttemptCount)
    ) {
      return { run: current, reused: true };
    }
    if (!current || current.status !== "running") throw storageFailure();
    try {
      return { run: await write(), reused: false };
    } catch {
      try {
        current = await dependencies.runs.getOwned(userId, input.runId);
      } catch {
        throw storageFailure();
      }
      if (
        current &&
        (isTerminal(current) || current.attemptCount !== input.expectedAttemptCount)
      ) {
        return { run: current, reused: true };
      }
      throw storageFailure();
    }
  }
}

async function completeWithRecovery(
  dependencies: InterviewQuestionGenerationServiceDependencies,
  userId: string,
  input: CompleteInterviewQuestionGenerationInput,
  requestId: string | null,
): Promise<InterviewQuestionGenerationServiceResult> {
  const write = async () => dependencies.runs.complete(input);
  try {
    return { run: await write(), reused: false };
  } catch {
    let current: InterviewQuestionGenerationRun | null;
    try {
      current = await dependencies.runs.getOwned(userId, input.runId);
    } catch {
      throw storageFailure();
    }
    if (
      current &&
      (isTerminal(current) || current.attemptCount !== input.expectedAttemptCount)
    ) {
      return { run: current, reused: true };
    }
    if (!current || current.status !== "running") throw storageFailure();
    try {
      return { run: await write(), reused: false };
    } catch {
      try {
        current = await dependencies.runs.getOwned(userId, input.runId);
      } catch {
        throw storageFailure();
      }
      if (
        current &&
        (isTerminal(current) || current.attemptCount !== input.expectedAttemptCount)
      ) {
        return { run: current, reused: true };
      }
      if (!current || current.status !== "running") throw storageFailure();
      return failWithRecovery(dependencies, userId, {
        runId: input.runId,
        expectedAttemptCount: input.expectedAttemptCount,
        errorCode: "interview-question-generation-provider-error",
        errorMessage: safeErrorMessage,
        requestId,
      });
    }
  }
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
    }): Promise<InterviewQuestionGenerationServiceResult> {
      if (input.run.status === "succeeded") {
        return { run: input.run, reused: true };
      }
      const claimed = await dependencies.runs.claim(
        input.run.id,
        input.run.attemptCount,
        input.run.status,
      );
      if (!claimed) {
        const current = await dependencies.runs.getOwned(
          input.userId,
          input.run.id,
        );
        if (!current) throw new Error("interview-question-generation-not-found");
        return { run: current, reused: true };
      }

      let claimedRun: InterviewQuestionGenerationRun | null;
      try {
        claimedRun = await dependencies.runs.getOwned(input.userId, input.run.id);
      } catch {
        throw storageFailure();
      }
      if (!claimedRun) throw new Error("interview-question-generation-not-found");

      const expectedAttempt = input.run.attemptCount + 1;
      if (
        claimedRun.status !== "running" ||
        claimedRun.attemptCount !== expectedAttempt
      ) {
        return { run: claimedRun, reused: true };
      }

      let requestId: string | null = null;
      let completeInput: CompleteInterviewQuestionGenerationInput;
      try {
        const provider = dependencies.providerFactory();
        const aiResult = await provider.generateInterviewQuestions({
          jdText: input.application.jdText,
          requirements: input.requirements,
          commonPrompts: input.commonPrompts,
        });
        requestId = sanitizeInterviewQuestionGenerationRequestId(
          aiResult.requestId,
        );
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

        completeInput = {
          runId: input.run.id,
          expectedAttemptCount: expectedAttempt,
          candidates: sanitized.questions,
          rejectedCandidateCount: sanitized.rejectedQuestionCount,
          aiUsage: {
            provider: aiResult.provider,
            model: aiResult.model,
            requestId,
            usage: aiResult.usage,
            priceScheduleVersion: scheduleMatches
              ? dependencies.priceSchedule!.version
              : null,
          },
          estimatedCost,
          requestId,
        };
      } catch (error) {
        return failWithRecovery(dependencies, input.userId, {
          runId: input.run.id,
          expectedAttemptCount: expectedAttempt,
          ...safeFailure(error),
          requestId,
        });
      }

      return completeWithRecovery(
        dependencies,
        input.userId,
        completeInput,
        requestId,
      );
    },
  };
}
