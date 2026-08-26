import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost, parsePriceSchedule } from "@/features/ai/pricing";
import { getAIProcessingConsentAt } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import { createDeepSeekAIProvider } from "@/features/extraction/deepseek-extractor";
import type { AIProvider } from "@/features/extraction/provider";
import { listConfirmedFactsForAnalysis } from "@/features/jd-analysis/repository";
import { createJDGapComparisonService } from "@/features/jd-gap-analysis/comparison-service";
import { jdGapV3Repository } from "@/features/jd-gap-analysis/gap-repository";
import { createJDGapAdvancePostHandler } from "@/features/jd-gap-analysis/http";
import {
  JD_GAP_POLICY_VERSION,
  JD_STRUCTURE_PROMPT_VERSION,
  comparisonPromptVariants,
} from "@/features/jd-gap-analysis/prompts";
import { createJDStructureService } from "@/features/jd-gap-analysis/structure-service";
import { jdStructureRepository } from "@/features/jd-gap-analysis/structure-repository";
import type {
  JDGapComparisonInput,
  JDGapComparisonOutput,
  JDStructureInput,
  JDStructureProviderOutput,
} from "@/features/jd-gap-analysis/schemas";
import { extractResumeText } from "@/features/source-assets/parsers";
import { getOwnedAsset } from "@/features/source-assets/repository";
import { downloadSource } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const fakeProviderName = "fake";
const fakeProviderModel = "fake-jd-gap-v3";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function exactResumeExcerpt(resumeText: string, criterionText: string) {
  const direct = new RegExp(escapeRegExp(criterionText.trim()), "iu").exec(resumeText);
  if (direct?.[0]) return direct[0].slice(0, 1000);

  const tokens = criterionText.match(/[\p{L}\p{N}+#.-]{2,}/gu) ?? [];
  for (const token of tokens.sort((left, right) => right.length - left.length)) {
    const match = new RegExp(escapeRegExp(token), "iu").exec(resumeText);
    if (match?.[0]) return match[0].slice(0, 1000);
  }
  return null;
}

function fakeProvider(): Pick<
  AIProvider,
  "structureJobDescription" | "compareJDGapCriteria"
> {
  return {
    async structureJobDescription(input: JDStructureInput) {
      const sourceExcerpt = input.jdText.trim().slice(0, 1000);
      const originalText = sourceExcerpt.slice(0, 500);
      return {
        data: {
          jdTranslationZh: `测试环境译文：${input.jdText}`.slice(0, 100_000),
          requirements: [{
            key: "r1",
            category: /sql|python|excel/iu.test(originalText) ? "skill" : "hard_requirement",
            requirementType: "required",
            originalText,
            translationZh: `测试要求：${originalText}`.slice(0, 1000),
            sourceExcerpt,
            allowsEquivalent: /equivalent|comparable|vergleichbar/iu.test(originalText),
            explicitGate: false,
            criteria: [{
              key: "c1",
              groupKey: "g1",
              groupRule: "all",
              kind: /sql|python|excel/iu.test(originalText) ? "tool" : "other",
              originalText,
              translationZh: `测试条件：${originalText}`.slice(0, 1000),
              constraint: { operator: "none", value: null, unit: null },
            }],
          }],
        } satisfies JDStructureProviderOutput,
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
    async compareJDGapCriteria(input: JDGapComparisonInput) {
      const assessments = input.requirements.flatMap((requirement) =>
        requirement.criteria.map((criterion) => {
          const excerpt = exactResumeExcerpt(input.resumeText, criterion.originalText);
          return {
            criterionId: criterion.id,
            resumeEvidenceStatus: excerpt ? "direct" as const : "none" as const,
            resumeExcerpt: excerpt,
            profileFactIds: [],
            gapType: excerpt ? "none" as const : "no_supporting_fact" as const,
            reasonZh: excerpt
              ? "测试环境找到所选简历中的原文证据。"
              : "测试环境未在所选简历中找到直接证据。",
            userQuestionZh: excerpt ? null : "你是否有可以补充的相关事实？",
          };
        }),
      );
      return {
        data: { assessments } satisfies JDGapComparisonOutput,
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

function configuredProvider(): Pick<
  AIProvider,
  "structureJobDescription" | "compareJDGapCriteria"
> {
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
    if (!estimateAITextCost({
      inputCacheHitTokens: 0,
      inputCacheMissTokens: 0,
      outputTokens: 0,
    }, schedule, at)) {
      console.warn("ai-price-config-unavailable");
      return undefined;
    }
    return schedule;
  } catch {
    console.warn("ai-price-config-unavailable");
    return undefined;
  }
}

const provider = providerConfiguration();
const promptVariant = getServerEnv().JD_GAP_MATCH_PROMPT_VARIANT;
const comparisonPromptVersion = comparisonPromptVariants[promptVariant].version;

export const POST = createJDGapAdvancePostHandler({
  getCurrentUser,
  getApplication: applicationRepository.get,
  getAIProcessingConsentAt,
  getOwnedAsset,
  listConfirmedFacts: listConfirmedFactsForAnalysis,
  createOrGetStructureRun: jdStructureRepository.createOrGet,
  listRequirements: jdStructureRepository.listRequirementsWithCriteria,
  createOrGetGapRun: jdGapV3Repository.createOrGet,
  providerConfig: {
    ...provider,
    structurePromptVersion: JD_STRUCTURE_PROMPT_VERSION,
    comparisonPromptVersion,
    comparisonPromptVariant: promptVariant,
    policyVersion: JD_GAP_POLICY_VERSION,
  },
  async runStructure(input) {
    const now = new Date();
    return createJDStructureService({
      runs: jdStructureRepository,
      providerFactory: configuredProvider,
      priceSchedule: configuredPriceSchedule(now),
      clock: () => now,
    }).run(input);
  },
  async runComparison(input) {
    const now = new Date();
    return createJDGapComparisonService({
      runs: jdGapV3Repository,
      storage: { download: downloadSource },
      parser: extractResumeText,
      providerFactory: configuredProvider,
      promptVariant,
      priceSchedule: configuredPriceSchedule(now),
      clock: () => now,
    }).run(input);
  },
});
