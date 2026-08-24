import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost } from "@/features/ai/pricing";
import type { AIProvider } from "@/features/extraction/provider";

import {
  sanitizeJDAnalysis,
  type ConfirmedFactForAnalysis,
  type JDAnalysisRun,
  type JDAnalysisRunResult,
  type JDRequirement,
} from "./schemas";

export type CompleteJDAnalysisInput = {
  runId: string;
  jdTranslationZh: string;
  requirements: JDRequirement[];
  rejectedRequirementCount: number;
  rejectedEvidenceCount: number;
  aiUsage: JDAnalysisRunResult["ai"];
  estimatedCost: JDAnalysisRunResult["estimatedCost"];
};

export type FailJDAnalysisInput = {
  runId: string;
  errorCode: string;
  errorMessage: string;
};

type RunRepository = {
  claim(runId: string): Promise<boolean>;
  getOwned(userId: string, runId: string): Promise<JDAnalysisRun | null>;
  complete(input: CompleteJDAnalysisInput): Promise<JDAnalysisRun>;
  fail(input: FailJDAnalysisInput): Promise<JDAnalysisRun>;
};

type JDAnalysisServiceDependencies = {
  runs: RunRepository;
  provider: Pick<AIProvider, "analyzeJobDescription">;
  priceSchedule?: AIPriceSchedule;
  clock?: () => Date;
};

const safeProviderErrors = new Set([
  "ai-provider-rate-limited",
  "ai-provider-request-failed",
  "ai-provider-timeout",
  "jd-analysis-invalid-output",
]);

function safeFailure(error: unknown) {
  const candidate = error instanceof Error ? error.message : "";
  if (
    candidate === "deepseek-api-key-missing" ||
    candidate === "ai-provider-authentication-failed"
  ) {
    return {
      errorCode: "jd-analysis-unavailable",
      errorMessage: "岗位分析暂不可用，JD 已安全保留。",
    };
  }
  return {
    errorCode: safeProviderErrors.has(candidate)
      ? candidate
      : "jd-analysis-failed",
    errorMessage: "岗位分析失败，请稍后重试。",
  };
}

export function createJDAnalysisService(
  dependencies: JDAnalysisServiceDependencies,
) {
  const clock = dependencies.clock ?? (() => new Date());

  return {
    async run(input: {
      userId: string;
      run: JDAnalysisRun;
      application: { id: string; jdText: string };
      confirmedFacts: ConfirmedFactForAnalysis[];
    }): Promise<JDAnalysisRun> {
      const claimed = await dependencies.runs.claim(input.run.id);
      if (!claimed) {
        const current = await dependencies.runs.getOwned(
          input.userId,
          input.run.id,
        );
        if (!current) throw new Error("application-analysis-not-found");
        return current;
      }

      try {
        const aiResult = await dependencies.provider.analyzeJobDescription({
          jdText: input.application.jdText,
          confirmedFacts: input.confirmedFacts,
        });
        const sanitized = sanitizeJDAnalysis({
          jdText: input.application.jdText,
          confirmedFacts: input.confirmedFacts,
          analysis: aiResult.data,
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
          jdTranslationZh: sanitized.jdTranslationZh,
          requirements: sanitized.requirements,
          rejectedRequirementCount: sanitized.rejectedRequirementCount,
          rejectedEvidenceCount: sanitized.rejectedEvidenceCount,
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
