import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost, parsePriceSchedule } from "@/features/ai/pricing";
import { getAIProcessingConsentAt } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import { createDeepSeekAIProvider } from "@/features/extraction/deepseek-extractor";
import type { AIProvider } from "@/features/extraction/provider";
import { createApplicationAnalysisPostHandler } from "@/features/jd-analysis/http";
import {
  jdAnalysisRepository,
  listConfirmedFactsForAnalysis,
} from "@/features/jd-analysis/repository";
import { createJDAnalysisService } from "@/features/jd-analysis/service";
import { getCurrentUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function fakeProvider(): Pick<AIProvider, "analyzeJobDescription"> {
  return {
    async analyzeJobDescription(input) {
      const sourceExcerpt = input.jdText.trim().slice(0, 240);
      const firstFact = input.confirmedFacts[0];
      return {
        data: {
          requirements: [
            {
              category: "responsibility",
              text: "理解并推进这份岗位描述中的核心职责",
              sourceExcerpt,
              priority: "core",
              matchStatus: firstFact ? "partial" : "none",
              matchReason: firstFact
                ? "一条已确认职业事实可作为部分准备依据。"
                : null,
              matchedFactIds: firstFact ? [firstFact.id] : [],
            },
          ],
        },
        provider: "fake",
        model: "fake-jd-analyzer-v1",
        requestId: null,
        usage: {
          inputCacheHitTokens: 0,
          inputCacheMissTokens: 0,
          outputTokens: 0,
        },
      };
    },
  };
}

function providerConfiguration() {
  const env = getServerEnv();
  if (env.E2E_FAKE_EXTRACTOR === "1" && process.env.NODE_ENV !== "production") {
    return { provider: "fake", model: "fake-jd-analyzer-v1" };
  }
  return { provider: env.AI_TEXT_PROVIDER, model: env.AI_TEXT_MODEL };
}

function configuredProvider(): Pick<AIProvider, "analyzeJobDescription"> {
  const env = getServerEnv();
  if (env.E2E_FAKE_EXTRACTOR === "1" && process.env.NODE_ENV !== "production") {
    return fakeProvider();
  }
  return {
    analyzeJobDescription(input) {
      return createDeepSeekAIProvider({
        apiKey: env.DEEPSEEK_API_KEY,
        model: env.AI_TEXT_MODEL,
      }).analyzeJobDescription(input);
    },
  };
}

function configuredPriceSchedule(at: Date): AIPriceSchedule | undefined {
  const raw = getServerEnv().AI_PRICE_SCHEDULE_JSON;
  if (!raw) return undefined;
  try {
    const schedule = parsePriceSchedule(raw);
    if (
      !estimateAITextCost(
        {
          inputCacheHitTokens: 0,
          inputCacheMissTokens: 0,
          outputTokens: 0,
        },
        schedule,
        at,
      )
    ) {
      return undefined;
    }
    return schedule;
  } catch {
    return undefined;
  }
}

export const POST = createApplicationAnalysisPostHandler({
  getCurrentUser,
  getApplication: applicationRepository.get,
  getAIProcessingConsentAt,
  listConfirmedFacts: listConfirmedFactsForAnalysis,
  createOrGetRun: jdAnalysisRepository.createOrGet,
  providerConfig: providerConfiguration(),
  providerFactory: configuredProvider,
  async runAnalysis({ userId, run, application, confirmedFacts, provider }) {
    const now = new Date();
    return createJDAnalysisService({
      runs: jdAnalysisRepository,
      provider,
      priceSchedule: configuredPriceSchedule(now),
      clock: () => now,
    }).run({ userId, run, application, confirmedFacts });
  },
});
