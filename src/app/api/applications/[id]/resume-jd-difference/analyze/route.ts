import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost, parsePriceSchedule } from "@/features/ai/pricing";
import { getAIProcessingConsentAt } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import { createDeepSeekAIProvider } from "@/features/extraction/deepseek-extractor";
import type { AIProvider } from "@/features/extraction/provider";
import { listConfirmedFactsForAnalysis } from "@/features/jd-analysis/repository";
import { createResumeJDDifferencePostHandler } from "@/features/resume-jd-difference/http";
import { resumeJDDifferenceRepository } from "@/features/resume-jd-difference/repository";
import { createResumeJDDifferenceService } from "@/features/resume-jd-difference/service";
import type {
  ResumeJDDifferenceInput,
  ResumeJDDifferenceOutput,
} from "@/features/resume-jd-difference/schemas";
import { extractResumeText } from "@/features/source-assets/parsers";
import { getOwnedAsset } from "@/features/source-assets/repository";
import { downloadSource } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const fakeProviderName = "fake";
const fakeProviderModel = "fake-resume-jd-difference-v4";

function boundedExactSource(value: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).trim();
}

function representativeTerm(jdExcerpt: string) {
  const terms = jdExcerpt.match(/[\p{L}\p{N}+#.-]{2,}/gu) ?? [];
  return boundedExactSource(
    terms.toSorted((left, right) => right.length - left.length)[0] ??
      jdExcerpt,
    120,
  );
}

function fakeOutput(input: ResumeJDDifferenceInput): ResumeJDDifferenceOutput {
  const jdExcerpt = boundedExactSource(input.jdText, 900);
  const resumeExcerpt = boundedExactSource(input.resumeText, 900);
  const term = representativeTerm(jdExcerpt);
  return {
    jobCore: {
      missionZh: "理解岗位核心任务，并检查当前简历能否用可回查证据支持。",
      coreCapabilities: ["岗位任务理解", "经历证据表达", "岗位语言对齐"],
      concepts: [
        {
          id: "concept-1",
          labelZh: "岗位核心概念",
          originalTerms: [term],
          importanceReasonZh: "该概念直接出现在当前岗位描述中。",
          priority: "critical",
        },
      ],
      gates: [
        {
          id: "gate-1",
          originalText: jdExcerpt,
          translationZh: "这项资格条件需要本人确认。",
          reasonZh: "端到端测试用于确认门槛会被单独展示。",
        },
      ],
      preferredItems: [],
    },
    overallDifference: {
      summaryZh: "当前简历有可回查内容，但仍需检查岗位语言和证据完整度。",
      topIssueIds: ["issue-1", "issue-2", "issue-3"],
    },
    issues: [
      {
        id: "issue-1",
        conceptId: "concept-1",
        jdOriginal: jdExcerpt,
        jdTranslationZh: "这是当前岗位描述中需要重点核对的内容。",
        resumeExcerpt,
        resumeStatusZh: "当前简历存在可回查的相邻内容。",
        profileFactIds: [],
        type: "language_misaligned",
        problemZh: "简历表达与岗位采用的语言仍不完全一致。",
        reasonZh: "该项用于端到端测试一次结果同时驱动两个页面。",
        priority: "critical",
        isGate: false,
        authenticity: "supported",
      },
      {
        id: "issue-2",
        conceptId: "concept-1",
        jdOriginal: jdExcerpt,
        jdTranslationZh: "这项岗位要求还需要补充具体使用场景。",
        resumeExcerpt,
        resumeStatusZh: "当前简历有相关内容，但场景仍不够具体。",
        profileFactIds: [],
        type: "missing_context",
        problemZh: "相关经历缺少足够具体的业务场景。",
        reasonZh: "该项用于验证三个重点都能完整显示。",
        priority: "important",
        isGate: false,
        authenticity: "supported",
      },
      {
        id: "issue-3",
        conceptId: "concept-1",
        jdOriginal: jdExcerpt,
        jdTranslationZh: "这项岗位要求还需要补充可验证的结果。",
        resumeExcerpt,
        resumeStatusZh: "当前简历有相关内容，但结果仍不够明确。",
        profileFactIds: [],
        type: "missing_result",
        problemZh: "相关经历缺少可验证的结果。",
        reasonZh: "该项用于验证完整差异列表和优先级。",
        priority: "minor",
        isGate: false,
        authenticity: "supported",
      },
      {
        id: "issue-4",
        conceptId: "concept-1",
        jdOriginal: jdExcerpt,
        jdTranslationZh: "这项岗位门槛需要本人确认。",
        resumeExcerpt: null,
        resumeStatusZh: "当前材料未找到相关证据",
        profileFactIds: [],
        type: "gate",
        problemZh: "资格条件不能仅凭当前简历确认。",
        reasonZh: "该项用于验证岗位门槛独立展示。",
        priority: "critical",
        isGate: true,
        authenticity: "needs_confirmation",
      },
    ],
    matched: [
      {
        id: "matched-1",
        conceptId: "concept-1",
        jdOriginal: jdExcerpt,
        jdTranslationZh: "这是当前岗位描述中已经有相邻证据的内容。",
        resumeExcerpt,
        profileFactIds: [],
        reasonZh: "引用内容可在当前简历中回查。",
      },
    ],
    directions: [
      {
        id: "direction-1",
        issueId: "issue-1",
        targetSection: "experience",
        targetExperienceZh: "当前可回查的相关经历",
        conceptId: "concept-1",
        jdTerms: [term],
        focusAreas: ["action", "context", "result"],
        synonymousJobLanguage: [term],
        authenticity: "supported",
        needsConfirmation: false,
        directionZh: "核对真实行动、使用场景和结果，并让表达贴近岗位使用的概念。",
      },
      {
        id: "direction-2",
        issueId: "issue-2",
        targetSection: "experience",
        targetExperienceZh: "当前可回查的相关经历",
        conceptId: "concept-1",
        jdTerms: [term],
        focusAreas: ["context", "stakeholders"],
        synonymousJobLanguage: [term],
        authenticity: "supported",
        needsConfirmation: false,
        directionZh: "核对这段真实经历发生的业务场景和协作对象。",
      },
      {
        id: "direction-3",
        issueId: "issue-3",
        targetSection: "experience",
        targetExperienceZh: "当前可回查的相关经历",
        conceptId: "concept-1",
        jdTerms: [term],
        focusAreas: ["result"],
        synonymousJobLanguage: [term],
        authenticity: "supported",
        needsConfirmation: false,
        directionZh: "核对这段真实经历是否有可以说明的结果或影响。",
      },
    ],
  };
}

function fakeProvider(): Pick<AIProvider, "analyzeResumeJDDifference"> {
  return {
    async analyzeResumeJDDifference(input) {
      return {
        data: fakeOutput(input),
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
  if (
    env.E2E_FAKE_EXTRACTOR === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    return { provider: fakeProviderName, model: fakeProviderModel };
  }
  return { provider: env.AI_TEXT_PROVIDER, model: env.AI_TEXT_MODEL };
}

function configuredProvider(): Pick<
  AIProvider,
  "analyzeResumeJDDifference"
> {
  const env = getServerEnv();
  if (
    env.E2E_FAKE_EXTRACTOR === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
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
      console.warn("ai-price-config-unavailable");
      return undefined;
    }
    return schedule;
  } catch {
    console.warn("ai-price-config-unavailable");
    return undefined;
  }
}

const providerConfig = providerConfiguration();
const promptVariant = getServerEnv().RESUME_JD_DIFFERENCE_PROMPT_VARIANT;

export const POST = createResumeJDDifferencePostHandler({
  getCurrentUser,
  getApplication: applicationRepository.get,
  getAIProcessingConsentAt,
  getOwnedAsset,
  listConfirmedFacts: listConfirmedFactsForAnalysis,
  async runAnalysis(input) {
    const now = new Date();
    return createResumeJDDifferenceService({
      runs: resumeJDDifferenceRepository,
      storage: { download: downloadSource },
      parser: extractResumeText,
      providerFactory: configuredProvider,
      ...providerConfig,
      promptVariant,
      priceSchedule: configuredPriceSchedule(now),
      clock: () => now,
    }).run(input);
  },
});
