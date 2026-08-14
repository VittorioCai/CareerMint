import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost, parsePriceSchedule } from "@/features/ai/pricing";
import { getAIProcessingConsentAt } from "@/features/account/repository";
import { createDeepSeekAIProvider } from "@/features/extraction/deepseek-extractor";
import { createSourceAssetExtractPostHandler } from "@/features/extraction/http";
import type { AIProvider } from "@/features/extraction/provider";
import { createResumeExtractionService } from "@/features/extraction/service";
import {
  claimJob,
  createOrGetJob,
  failJob,
  getOwnedJob,
  succeedJob,
} from "@/features/jobs/repository";
import { getOwnedAsset, setAssetStatus } from "@/features/source-assets/repository";
import { extractResumeText } from "@/features/source-assets/parsers";
import { downloadSource } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function fakeProvider(): Pick<AIProvider, "extractResumeFacts"> {
  return {
    async extractResumeFacts(resumeText) {
      const achievementExcerpt =
        "Improved checkout conversion by 18% through funnel analysis.";
      const hasAchievement = resumeText.includes(achievementExcerpt);
      const excerpt = hasAchievement
        ? achievementExcerpt
        : resumeText.slice(0, Math.min(resumeText.length, 500));
      return {
        data: {
          facts: [
            {
              factType: hasAchievement ? "achievement" : "summary",
              data: {
                title: hasAchievement
                  ? "Improved checkout conversion by 18%"
                  : "简历内容摘要",
                organization: null,
                startDate: null,
                endDate: null,
                description: excerpt,
                skills: hasAchievement ? ["Funnel analysis"] : [],
              },
              sourceExcerpt: excerpt,
              needsDetailReason: null,
            },
          ],
        },
        provider: "fake",
        model: "fake-resume-extractor-v1",
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

function configuredProvider(): Pick<AIProvider, "extractResumeFacts"> {
  const env = getServerEnv();
  if (env.E2E_FAKE_EXTRACTOR === "1" && process.env.NODE_ENV !== "production") {
    return fakeProvider();
  }

  return {
    extractResumeFacts(resumeText) {
      return createDeepSeekAIProvider({
        apiKey: env.DEEPSEEK_API_KEY,
        model: env.AI_TEXT_MODEL,
      }).extractResumeFacts(resumeText);
    },
  };
}

function configuredPriceSchedule(at: Date): AIPriceSchedule | undefined {
  const raw = getServerEnv().AI_PRICE_SCHEDULE_JSON;
  if (!raw) {
    console.warn("ai-price-config-unavailable");
    return undefined;
  }

  try {
    const schedule = parsePriceSchedule(raw);
    const effective = estimateAITextCost(
      {
        inputCacheHitTokens: 0,
        inputCacheMissTokens: 0,
        outputTokens: 0,
      },
      schedule,
      at,
    );
    if (!effective) throw new Error("unavailable");
    return schedule;
  } catch {
    console.warn("ai-price-config-unavailable");
    return undefined;
  }
}

export const POST = createSourceAssetExtractPostHandler({
  getCurrentUser,
  getOwnedAsset,
  getAIProcessingConsentAt,
  createOrGetJob,
  providerFactory: configuredProvider,
  async runExtraction({ userId, job, asset, provider }) {
    const now = new Date();
    return createResumeExtractionService({
      jobs: { claimJob, getOwnedJob, succeedJob, failJob },
      assets: { setStatus: setAssetStatus },
      storage: { download: downloadSource },
      parser: extractResumeText,
      provider,
      priceSchedule: configuredPriceSchedule(now),
      clock: () => now,
    }).run({ userId, job, asset });
  },
});
