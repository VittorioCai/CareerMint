import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost, parsePriceSchedule } from "@/features/ai/pricing";
import { getAIProcessingConsentAt } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import { createDeepSeekAIProvider } from "@/features/extraction/deepseek-extractor";
import type { AIProvider } from "@/features/extraction/provider";
import { jdAnalysisRepository } from "@/features/jd-analysis/repository";
import { createResumeGapPostHandler } from "@/features/resume-gaps/http";
import {
  resumeGapRepository,
} from "@/features/resume-gaps/repository";
import { createResumeGapService } from "@/features/resume-gaps/service";
import type {
  ResumeGapAnalysisInput,
  ResumeGapProviderOutput,
} from "@/features/resume-gaps/schemas";
import { extractResumeText } from "@/features/source-assets/parsers";
import { getOwnedAsset } from "@/features/source-assets/repository";
import { downloadSource } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const fakeProviderName = "fake";
const fakeProviderModel = "fake-resume-gap-v1";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Return text copied from the supplied resume, preserving the original
 * casing and whitespace so the service sanitizer can ground it exactly.
 */
function exactResumeExcerpt(resumeText: string, requirementText: string) {
  const text = requirementText.trim();
  if (!text) return null;

  const directPattern = new RegExp(escapeRegExp(text), "iu");
  const directMatch = directPattern.exec(resumeText);
  if (directMatch?.[0]) return directMatch[0].slice(0, 700);

  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length === 0) return null;
  const whitespacePattern = new RegExp(
    words.map(escapeRegExp).join("\\s+"),
    "iu",
  );
  const whitespaceMatch = whitespacePattern.exec(resumeText);
  return whitespaceMatch?.[0]?.slice(0, 700) ?? null;
}

/**
 * The fake is deliberately small and deterministic. It only copies exact
 * supplied resume text and never invents an excerpt or a requirement fact.
 */
function fakeProvider(): Pick<AIProvider, "analyzeResumeGaps"> {
  return {
    async analyzeResumeGaps(input: ResumeGapAnalysisInput) {
      const items = input.requirements.map((requirement, index) => {
        const excerpt = exactResumeExcerpt(input.resumeText, requirement.text);
        const resumeCoverage: "covered" | "partial" | "missing" =
          index === 0 && excerpt
            ? "covered"
            : index === 1 && excerpt
              ? "partial"
              : "missing";

        return {
          requirementId: requirement.id,
          resumeCoverage,
          resumeExcerpt:
            resumeCoverage === "missing" ? null : excerpt,
        };
      });

      return {
        data: { items } satisfies ResumeGapProviderOutput,
        provider: fakeProviderName,
        model: fakeProviderModel,
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
    return { provider: fakeProviderName, model: fakeProviderModel };
  }
  return { provider: env.AI_TEXT_PROVIDER, model: env.AI_TEXT_MODEL };
}

/**
 * This factory is passed through the HTTP boundary and called only after all
 * ownership/consent/cache guards and a successful run claim have completed.
 */
function configuredProvider(): Pick<AIProvider, "analyzeResumeGaps"> {
  const env = getServerEnv();
  if (env.E2E_FAKE_EXTRACTOR === "1" && process.env.NODE_ENV !== "production") {
    return fakeProvider();
  }
  return createDeepSeekAIProvider({
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.AI_TEXT_MODEL,
  });
}

function configuredPriceSchedule(at: Date): AIPriceSchedule | undefined {
  const raw = getServerEnv().AI_PRICE_SCHEDULE_JSON;
  if (!raw) return undefined;

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
    if (!effective) {
      console.warn("ai-price-config-unavailable");
      return undefined;
    }
    return schedule;
  } catch {
    // Never include raw configuration, provider content, or a parser detail
    // in operational logs. Pricing is metadata-only and must not block work.
    console.warn("ai-price-config-unavailable");
    return undefined;
  }
}

const providerConfig = providerConfiguration();

export const POST = createResumeGapPostHandler({
  getCurrentUser,
  getApplication: applicationRepository.get,
  getAIProcessingConsentAt,
  getLatestSucceededAnalysis: jdAnalysisRepository.getLatestSucceeded,
  listRequirements: jdAnalysisRepository.listRequirements,
  getOwnedAsset,
  createOrGetRun: resumeGapRepository.createOrGet,
  providerConfig,
  providerFactory: configuredProvider,
  async runAnalysis({
    userId,
    run,
    asset,
    analysisRun,
    requirements,
    ocrText,
    providerFactory,
  }) {
    const now = new Date();
    return createResumeGapService({
      runs: resumeGapRepository,
      storage: { download: downloadSource },
      parser: extractResumeText,
      providerFactory,
      priceSchedule: configuredPriceSchedule(now),
      clock: () => now,
    }).run({
      userId,
      run,
      asset,
      analysisRun,
      requirements,
      ...(ocrText === undefined ? {} : { ocrText }),
      providerFactory,
    });
  },
});
