import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost, parsePriceSchedule } from "@/features/ai/pricing";
import { getAIProcessingConsentAt } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import { createDeepSeekAIProvider } from "@/features/extraction/deepseek-extractor";
import type { AIProvider } from "@/features/extraction/provider";
import { listConfirmedFactsForAnalysis } from "@/features/jd-analysis/repository";
import { createResumeGenerationPostHandler } from "@/features/resume-customization/http";
import {
  listRequirementContexts,
  resumeCustomizationRepository,
} from "@/features/resume-customization/repository";
import { createResumeGenerationService } from "@/features/resume-customization/service";
import { getCurrentUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function fakeProvider(): Pick<AIProvider, "generateResumeSuggestions"> {
  return {
    async generateResumeSuggestions(input) {
      const firstFact = input.confirmedFacts[0];
      const firstRequirement = input.requirements[0];
      return {
        data: {
          suggestions: firstFact
            ? [
                {
                  section:
                    firstFact.factType === "work_experience"
                      ? "experience"
                      : firstFact.factType === "skill"
                        ? "skills"
                      : firstFact.factType === "story"
                        ? "summary"
                        : firstFact.factType,
                  content: firstFact.description.slice(0, 700),
                  reason: firstRequirement
                    ? `Uses confirmed evidence relevant to: ${firstRequirement.text}`
                    : "Uses one confirmed career fact.",
                  factIds: [firstFact.id],
                  requirementIds: firstRequirement
                    ? [firstRequirement.id]
                    : [],
                },
              ]
            : [],
        },
        provider: "fake",
        model: "fake-resume-generator-v1",
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
    return { provider: "fake", model: "fake-resume-generator-v1" };
  }
  return { provider: env.AI_TEXT_PROVIDER, model: env.AI_TEXT_MODEL };
}

function configuredProvider(): Pick<AIProvider, "generateResumeSuggestions"> {
  const env = getServerEnv();
  if (env.E2E_FAKE_EXTRACTOR === "1" && process.env.NODE_ENV !== "production") {
    return fakeProvider();
  }
  return {
    generateResumeSuggestions(input) {
      return createDeepSeekAIProvider({
        apiKey: env.DEEPSEEK_API_KEY,
        model: env.AI_TEXT_MODEL,
      }).generateResumeSuggestions(input);
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

export const POST = createResumeGenerationPostHandler({
  getCurrentUser,
  getApplication: applicationRepository.get,
  getAIProcessingConsentAt,
  listConfirmedFacts: listConfirmedFactsForAnalysis,
  listRequirements: listRequirementContexts,
  createOrGetRun: resumeCustomizationRepository.createOrGet,
  providerConfig: providerConfiguration(),
  providerFactory: configuredProvider,
  async runGeneration({
    userId,
    run,
    application,
    confirmedFacts,
    requirements,
    provider,
  }) {
    const now = new Date();
    return createResumeGenerationService({
      runs: resumeCustomizationRepository,
      provider,
      priceSchedule: configuredPriceSchedule(now),
      clock: () => now,
    }).run({ userId, run, application, confirmedFacts, requirements });
  },
});
