import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost, parsePriceSchedule } from "@/features/ai/pricing";
import { getAIProcessingConsentAt } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import { createDeepSeekAIProvider } from "@/features/extraction/deepseek-extractor";
import type { AIProvider } from "@/features/extraction/provider";
import { listConfirmedFactsForAnalysis } from "@/features/career-profile/repository";
import { createResumeJDDifferencePostHandler } from "@/features/resume-jd-difference/http";
import { resumeJDDifferenceRepository } from "@/features/resume-jd-difference/repository";
import { noEvidenceWording } from "@/features/resume-jd-difference/prompts";
import { createResumeJDDifferenceService } from "@/features/resume-jd-difference/service";
import type {
  ResumeJDDifferenceInput,
  ResumeJDDifferenceOutput,
} from "@/features/resume-jd-difference/schemas";
import { extractResumeText } from "@/features/source-assets/parsers";
import { getOwnedAsset } from "@/features/source-assets/repository";
import { downloadSource } from "@/features/source-assets/storage";
import type { AppLocale } from "@/i18n/locale";
import { getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const fakeProviderName = "fake";
const fakeProviderModel = "fake-resume-jd-difference-v4";
const serviceLogger = {
  info(event: string, metadata: Record<string, unknown>) {
    console.info(event, metadata);
  },
  error(event: string, metadata: Record<string, unknown>) {
    console.error(event, metadata);
  },
};

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

/**
 * The fake analysis's prose, in whichever language was asked for.
 *
 * A fake that answered in Chinese whatever the request said would make the
 * end-to-end suite agree with itself while the real provider did something
 * else — and it would hide the one thing worth checking about a second output
 * language: that the language a run was asked for is the language it comes
 * back in.
 *
 * The excerpts and terms are still lifted from the caller's own JD and
 * resume, because those are the parts the verifier traces back.
 */
const fakeProse = {
  "zh-CN": {
    mission: "理解岗位核心任务，并检查当前简历能否用可回查证据支持。",
    coreCapabilities: ["岗位任务理解", "经历证据表达", "岗位语言对齐"],
    conceptLabel: "岗位核心概念",
    conceptReason: "该概念直接出现在当前岗位描述中。",
    gateTranslation: "这项资格条件需要本人确认。",
    gateReason: "端到端测试用于确认门槛会被单独展示。",
    summary: "当前简历有可回查内容，但仍需检查岗位语言和证据完整度。",
    languageTranslation: "这是当前岗位描述中需要重点核对的内容。",
    languageStatus: "当前简历存在可回查的相邻内容。",
    languageProblem: "简历表达与岗位采用的语言仍不完全一致。",
    languageReason: "该项用于端到端测试一次结果同时驱动两个页面。",
    contextTranslation: "这项岗位要求还需要补充具体使用场景。",
    contextStatus: "当前简历有相关内容，但场景仍不够具体。",
    contextProblem: "相关经历缺少足够具体的业务场景。",
    contextReason: "该项用于验证三个重点都能完整显示。",
    resultTranslation: "这项岗位要求还需要补充可验证的结果。",
    resultStatus: "当前简历有相关内容，但结果仍不够明确。",
    resultProblem: "相关经历缺少可验证的结果。",
    resultReason: "该项用于验证完整差异列表和优先级。",
    gateIssueTranslation: "这项岗位门槛需要本人确认。",
    gateIssueProblem: "资格条件不能仅凭当前简历确认。",
    gateIssueReason: "该项用于验证岗位门槛独立展示。",
    matchedTranslation: "这是当前岗位描述中已经有相邻证据的内容。",
    matchedReason: "引用内容可在当前简历中回查。",
    targetExperience: "当前可回查的相关经历",
    languageDirection: "核对真实行动、使用场景和结果，并让表达贴近岗位使用的概念。",
    contextDirection: "核对这段真实经历发生的业务场景和协作对象。",
    resultDirection: "核对这段真实经历是否有可以说明的结果或影响。",
  },
  en: {
    mission:
      "Understand the job's core task and check whether the resume can support it with evidence you can point at.",
    coreCapabilities: [
      "Reading the job's task",
      "Stating evidence from experience",
      "Aligning with the job's language",
    ],
    conceptLabel: "The job's core concept",
    conceptReason: "The concept appears directly in this job description.",
    gateTranslation: "This qualification needs you to confirm it.",
    gateReason:
      "This exists so the end-to-end suite can confirm hard requirements are shown separately.",
    summary:
      "The resume has content to point at, but the job's language and the completeness of the evidence still need checking.",
    languageTranslation: "This is the part of the job description most worth checking.",
    languageStatus: "The resume has adjacent content you can point at.",
    languageProblem:
      "The resume's wording is still not quite the wording this job uses.",
    languageReason:
      "This exists so the end-to-end suite can check one result driving two pages.",
    contextTranslation: "This requirement still needs the situation spelled out.",
    contextStatus: "The resume has relevant content, but the situation is still vague.",
    contextProblem: "The experience is missing a concrete business situation.",
    contextReason: "This exists to check that all three focus areas display in full.",
    resultTranslation: "This requirement still needs a verifiable result.",
    resultStatus: "The resume has relevant content, but the result is still unclear.",
    resultProblem: "The experience is missing a verifiable result.",
    resultReason: "This exists to check the full difference list and its priorities.",
    gateIssueTranslation: "This hard requirement needs you to confirm it.",
    gateIssueProblem: "A qualification cannot be confirmed from the resume alone.",
    gateIssueReason: "This exists to check that hard requirements display on their own.",
    matchedTranslation:
      "This is the part of the job description that already has adjacent evidence.",
    matchedReason: "The quoted text can be traced back in the resume.",
    targetExperience: "The relevant experience you can point at",
    languageDirection:
      "Check the real action, the situation and the result, and bring the wording closer to the concept this job uses.",
    contextDirection:
      "Check the business situation this experience happened in and who you worked with.",
    resultDirection:
      "Check whether this experience has a result or an impact you can state.",
  },
} as const satisfies Record<AppLocale, unknown>;

function fakeOutput(
  input: ResumeJDDifferenceInput,
  outputLocale: AppLocale,
): ResumeJDDifferenceOutput {
  const prose = fakeProse[outputLocale];
  const jdExcerpt = boundedExactSource(input.jdText, 900);
  const resumeExcerpt = boundedExactSource(input.resumeText, 900);
  const term = representativeTerm(jdExcerpt);
  return {
    jobCore: {
      mission: prose.mission,
      coreCapabilities: [...prose.coreCapabilities],
      concepts: [
        {
          id: "concept-1",
          label: prose.conceptLabel,
          originalTerms: [term],
          importanceReason: prose.conceptReason,
          priority: "critical",
        },
      ],
      gates: [
        {
          id: "gate-1",
          originalText: jdExcerpt,
          translation: prose.gateTranslation,
          reason: prose.gateReason,
        },
      ],
      preferredItems: [],
    },
    overallDifference: {
      summary: prose.summary,
      topIssueIds: ["issue-1", "issue-2", "issue-3"],
    },
    issues: [
      {
        id: "issue-1",
        conceptId: "concept-1",
        jdOriginal: jdExcerpt,
        jdTranslation: prose.languageTranslation,
        resumeExcerpt,
        resumeStatus: prose.languageStatus,
        profileFactIds: [],
        type: "language_misaligned",
        problem: prose.languageProblem,
        reason: prose.languageReason,
        priority: "critical",
        isGate: false,
        authenticity: "supported",
      },
      {
        id: "issue-2",
        conceptId: "concept-1",
        jdOriginal: jdExcerpt,
        jdTranslation: prose.contextTranslation,
        resumeExcerpt,
        resumeStatus: prose.contextStatus,
        profileFactIds: [],
        type: "missing_context",
        problem: prose.contextProblem,
        reason: prose.contextReason,
        priority: "important",
        isGate: false,
        authenticity: "supported",
      },
      {
        id: "issue-3",
        conceptId: "concept-1",
        jdOriginal: jdExcerpt,
        jdTranslation: prose.resultTranslation,
        resumeExcerpt,
        resumeStatus: prose.resultStatus,
        profileFactIds: [],
        type: "missing_result",
        problem: prose.resultProblem,
        reason: prose.resultReason,
        priority: "minor",
        isGate: false,
        authenticity: "supported",
      },
      {
        id: "issue-4",
        conceptId: "concept-1",
        jdOriginal: jdExcerpt,
        jdTranslation: prose.gateIssueTranslation,
        resumeExcerpt: null,
        resumeStatus: noEvidenceWording(outputLocale),
        profileFactIds: [],
        type: "gate",
        problem: prose.gateIssueProblem,
        reason: prose.gateIssueReason,
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
        jdTranslation: prose.matchedTranslation,
        resumeExcerpt,
        profileFactIds: [],
        reason: prose.matchedReason,
      },
    ],
    directions: [
      {
        id: "direction-1",
        issueId: "issue-1",
        targetSection: "experience",
        targetExperience: prose.targetExperience,
        conceptId: "concept-1",
        jdTerms: [term],
        focusAreas: ["action", "context", "result"],
        synonymousJobLanguage: [term],
        authenticity: "supported",
        needsConfirmation: false,
        direction: prose.languageDirection,
      },
      {
        id: "direction-2",
        issueId: "issue-2",
        targetSection: "experience",
        targetExperience: prose.targetExperience,
        conceptId: "concept-1",
        jdTerms: [term],
        focusAreas: ["context", "stakeholders"],
        synonymousJobLanguage: [term],
        authenticity: "supported",
        needsConfirmation: false,
        direction: prose.contextDirection,
      },
      {
        id: "direction-3",
        issueId: "issue-3",
        targetSection: "experience",
        targetExperience: prose.targetExperience,
        conceptId: "concept-1",
        jdTerms: [term],
        focusAreas: ["result"],
        synonymousJobLanguage: [term],
        authenticity: "supported",
        needsConfirmation: false,
        direction: prose.resultDirection,
      },
    ],
  };
}

function fakeProvider(): Pick<AIProvider, "analyzeResumeJDDifference"> {
  return {
    async analyzeResumeJDDifference(input, options) {
      return {
        data: fakeOutput(input, options.outputLocale),
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
  getOutputLocale: getLocale,
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
      logger: serviceLogger,
    }).run(input);
  },
});
