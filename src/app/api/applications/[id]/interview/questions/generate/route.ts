import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost, parsePriceSchedule } from "@/features/ai/pricing";
import { getAIProcessingConsentAt } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import type { AIProvider } from "@/features/extraction/provider";
import { createDeepSeekAIProvider } from "@/features/extraction/deepseek-extractor";
import { jdAnalysisRepository } from "@/features/jd-analysis/repository";
import {
  interviewPreparationRepository,
} from "@/features/interview-preparation/repository";
import { createInterviewQuestionGenerationPostHandler } from "@/features/interview-preparation/generation-http";
import { interviewQuestionGenerationRepository } from "@/features/interview-preparation/generation-repository";
import { createInterviewQuestionGenerationService } from "@/features/interview-preparation/generation-service";
import {
  createFakeInterviewQuestionProvider,
  selectInterviewQuestionProviderConfiguration,
} from "@/features/interview-preparation/generation-fake";
import { getCurrentUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function providerConfiguration() {
  const env = getServerEnv();
  return selectInterviewQuestionProviderConfiguration({
    fakeExtractor: env.E2E_FAKE_EXTRACTOR === "1",
    production: process.env.NODE_ENV === "production",
    provider: env.AI_TEXT_PROVIDER,
    model: env.AI_TEXT_MODEL,
  });
}

function configuredProvider(): Pick<AIProvider, "generateInterviewQuestions"> {
  const env = getServerEnv();
  const config = selectInterviewQuestionProviderConfiguration({
    fakeExtractor: env.E2E_FAKE_EXTRACTOR === "1",
    production: process.env.NODE_ENV === "production",
    provider: env.AI_TEXT_PROVIDER,
    model: env.AI_TEXT_MODEL,
  });
  if (config.provider === "fake") {
    return createFakeInterviewQuestionProvider();
  }
  return {
    generateInterviewQuestions(input) {
      return createDeepSeekAIProvider({
        apiKey: env.DEEPSEEK_API_KEY,
        model: env.AI_TEXT_MODEL,
      }).generateInterviewQuestions(input);
    },
  };
}

function configuredPriceSchedule(at: Date): AIPriceSchedule | undefined {
  const raw = getServerEnv().AI_PRICE_SCHEDULE_JSON;
  if (!raw) return undefined;
  try {
    const schedule = parsePriceSchedule(raw);
    return estimateAITextCost(
      {
        inputCacheHitTokens: 0,
        inputCacheMissTokens: 0,
        outputTokens: 0,
      },
      schedule,
      at,
    )
      ? schedule
      : undefined;
  } catch {
    return undefined;
  }
}

const providerConfig = providerConfiguration();

export const POST = createInterviewQuestionGenerationPostHandler({
  getCurrentUser,
  getApplication: applicationRepository.get,
  getAIProcessingConsentAt,
  async listRequirements(userId, applicationId) {
    const rows = await jdAnalysisRepository.listRequirements(userId, applicationId);
    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      text: row.text,
      sourceExcerpt: row.sourceExcerpt,
      priority: row.priority,
    }));
  },
  async listCommonPrompts(userId) {
    const questions = await interviewPreparationRepository.list(userId);
    return questions
      .filter((question) => question.category === "common")
      .map((question) => question.prompt);
  },
  createOrGetRun: interviewQuestionGenerationRepository.createOrGet,
  providerConfig,
  providerFactory: configuredProvider,
  async runGeneration({
    userId,
    run,
    application,
    requirements,
    commonPrompts,
    providerFactory,
  }) {
    const now = new Date();
    return createInterviewQuestionGenerationService({
      runs: interviewQuestionGenerationRepository,
      providerFactory,
      priceSchedule: configuredPriceSchedule(now),
      clock: () => now,
    }).run({
      userId,
      run,
      application,
      requirements,
      commonPrompts,
    });
  },
});
