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
const e2eFixtureMarker = "E2E JD GAP V3 FIXTURE.";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function exactResumeExcerpt(resumeText: string, criterionText: string) {
  const direct = new RegExp(escapeRegExp(criterionText.trim()), "iu").exec(resumeText);
  if (direct?.[0]) return direct[0].slice(0, 1000);

  const genericTokens = new Set([
    "advanced", "accepted", "comparable", "conduct", "degree", "experience",
    "required", "show", "will", "with", "years",
  ]);
  const tokens = (criterionText.match(/[\p{L}\p{N}+#.-]{2,}/gu) ?? [])
    .filter((token) => !genericTokens.has(token.toLowerCase()));
  for (const token of tokens.sort((left, right) => right.length - left.length)) {
    const match = new RegExp(escapeRegExp(token), "iu").exec(resumeText);
    if (match?.[0]) return match[0].slice(0, 1000);
  }
  return null;
}

function e2eStructureOutput(): JDStructureProviderOutput["requirements"] {
  return [
    {
      key: "r1",
      category: "hard_requirement",
      requirementType: "required",
      originalText: "A Product Analyst degree or a comparable degree is accepted.",
      translationZh: "接受产品分析或可比专业学位。",
      sourceExcerpt: "A Product Analyst degree or a comparable degree is accepted.",
      allowsEquivalent: true,
      explicitGate: false,
      criteria: [{
        key: "c1",
        groupKey: "g1",
        groupRule: "all",
        kind: "degree_field",
        originalText: "Product Analyst",
        translationZh: "产品分析或可比专业",
        constraint: {
          operator: "equivalent_allowed",
          value: "Product Analyst",
          unit: null,
        },
      }],
    },
    {
      key: "r2",
      category: "skill",
      requirementType: "required",
      originalText: "Advanced SQL or Python is required for customer funnel analysis.",
      translationZh: "客户漏斗分析需要高级 SQL 或 Python。",
      sourceExcerpt: "Advanced SQL or Python is required for customer funnel analysis.",
      allowsEquivalent: false,
      explicitGate: false,
      criteria: [
        {
          key: "c2",
          groupKey: "g1",
          groupRule: "any",
          kind: "tool",
          originalText: "Advanced SQL",
          translationZh: "高级 SQL",
          constraint: { operator: "exact", value: "SQL", unit: null },
        },
        {
          key: "c3",
          groupKey: "g1",
          groupRule: "any",
          kind: "tool",
          originalText: "Python",
          translationZh: "Python",
          constraint: { operator: "exact", value: "Python", unit: null },
        },
      ],
    },
    {
      key: "r3",
      category: "hard_requirement",
      requirementType: "core",
      originalText: "You must show a measurable checkout conversion result.",
      translationZh: "必须展示可量化的结账转化成果。",
      sourceExcerpt: "You must show a measurable checkout conversion result.",
      allowsEquivalent: false,
      explicitGate: false,
      criteria: [{
        key: "c4",
        groupKey: "g1",
        groupRule: "all",
        kind: "quantified_outcome",
        originalText: "measurable checkout conversion result",
        translationZh: "可量化的结账转化成果",
        constraint: { operator: "none", value: null, unit: null },
      }],
    },
    {
      key: "r4",
      category: "hard_requirement",
      requirementType: "required",
      originalText: "At least five years of product analytics experience is required.",
      translationZh: "需要至少五年产品分析经验。",
      sourceExcerpt: "At least five years of product analytics experience is required.",
      allowsEquivalent: false,
      explicitGate: false,
      criteria: [{
        key: "c5",
        groupKey: "g1",
        groupRule: "all",
        kind: "years_experience",
        originalText: "five years of product analytics experience",
        translationZh: "五年产品分析经验",
        constraint: { operator: "gte", value: "5", unit: "years" },
      }],
    },
    {
      key: "r5",
      category: "language_work_authorization",
      requirementType: "required",
      originalText: "German C1 is required.",
      translationZh: "德语需达到 C1。",
      sourceExcerpt: "German C1 is required.",
      allowsEquivalent: false,
      explicitGate: true,
      criteria: [{
        key: "c6",
        groupKey: "g1",
        groupRule: "all",
        kind: "language",
        originalText: "German C1",
        translationZh: "德语 C1",
        constraint: { operator: "exact", value: "C1", unit: null },
      }],
    },
    {
      key: "r6",
      category: "language_work_authorization",
      requirementType: "required",
      originalText: "Valid German work authorization is mandatory.",
      translationZh: "必须持有有效的德国工作许可。",
      sourceExcerpt: "Valid German work authorization is mandatory.",
      allowsEquivalent: false,
      explicitGate: true,
      criteria: [{
        key: "c7",
        groupKey: "g1",
        groupRule: "all",
        kind: "work_authorization",
        originalText: "Valid German work authorization",
        translationZh: "有效的德国工作许可",
        constraint: { operator: "exact", value: "German", unit: null },
      }],
    },
    {
      key: "r7",
      category: "responsibility",
      requirementType: "core",
      originalText: "You will conduct funnel analysis for product decisions.",
      translationZh: "负责为产品决策开展漏斗分析。",
      sourceExcerpt: "You will conduct funnel analysis for product decisions.",
      allowsEquivalent: false,
      explicitGate: false,
      criteria: [{
        key: "c8",
        groupKey: "g1",
        groupRule: "all",
        kind: "responsibility",
        originalText: "funnel analysis",
        translationZh: "漏斗分析",
        constraint: { operator: "none", value: null, unit: null },
      }],
    },
    {
      key: "r8",
      category: "preferred",
      requirementType: "preferred",
      originalText: "Quantum forecasting experience is preferred.",
      translationZh: "有量子预测经验者优先。",
      sourceExcerpt: "Quantum forecasting experience is preferred.",
      allowsEquivalent: false,
      explicitGate: false,
      criteria: [{
        key: "c9",
        groupKey: "g1",
        groupRule: "all",
        kind: "other",
        originalText: "Quantum forecasting",
        translationZh: "量子预测",
        constraint: { operator: "exact", value: "Quantum forecasting", unit: null },
      }],
    },
    {
      key: "r9",
      category: "hard_requirement",
      requirementType: "required",
      originalText: "A business informatics degree is mandatory; no equivalent field is accepted.",
      translationZh: "必须是商业信息学学位，不接受相近专业。",
      sourceExcerpt: "A business informatics degree is mandatory; no equivalent field is accepted.",
      allowsEquivalent: false,
      explicitGate: true,
      criteria: [{
        key: "c10",
        groupKey: "g1",
        groupRule: "all",
        kind: "degree_field",
        originalText: "business informatics degree",
        translationZh: "商业信息学学位",
        constraint: { operator: "exact", value: "business informatics", unit: null },
      }],
    },
    {
      key: "r10",
      category: "skill",
      requirementType: "core",
      originalText: "Tableau dashboard experience is required.",
      translationZh: "需要具备 Tableau 仪表盘经验。",
      sourceExcerpt: "Tableau dashboard experience is required.",
      allowsEquivalent: false,
      explicitGate: false,
      criteria: [{
        key: "c11",
        groupKey: "g1",
        groupRule: "all",
        kind: "tool",
        originalText: "Tableau dashboard experience",
        translationZh: "Tableau 仪表盘经验",
        constraint: { operator: "exact", value: "Tableau", unit: null },
      }],
    },
    {
      key: "r11",
      category: "responsibility",
      requirementType: "core",
      originalText: "You will facilitate stakeholder workshops.",
      translationZh: "负责主持利益相关方工作坊。",
      sourceExcerpt: "You will facilitate stakeholder workshops.",
      allowsEquivalent: false,
      explicitGate: false,
      criteria: [{
        key: "c12",
        groupKey: "g1",
        groupRule: "all",
        kind: "responsibility",
        originalText: "facilitate stakeholder workshops",
        translationZh: "主持利益相关方工作坊",
        constraint: { operator: "none", value: null, unit: null },
      }],
    },
    {
      key: "r12",
      category: "responsibility",
      requirementType: "core",
      originalText: "You will conduct market research.",
      translationZh: "负责开展市场研究。",
      sourceExcerpt: "You will conduct market research.",
      allowsEquivalent: false,
      explicitGate: false,
      criteria: [{
        key: "c13",
        groupKey: "g1",
        groupRule: "all",
        kind: "responsibility",
        originalText: "conduct market research",
        translationZh: "开展市场研究",
        constraint: { operator: "none", value: null, unit: null },
      }],
    },
    {
      key: "r13",
      category: "hard_requirement",
      requirementType: "core",
      originalText: "A/B experimentation experience is required.",
      translationZh: "需要具备 A/B 实验经验。",
      sourceExcerpt: "A/B experimentation experience is required.",
      allowsEquivalent: false,
      explicitGate: false,
      criteria: [{
        key: "c14",
        groupKey: "g1",
        groupRule: "all",
        kind: "other",
        originalText: "A/B experimentation experience",
        translationZh: "A/B 实验经验",
        constraint: { operator: "none", value: null, unit: null },
      }],
    },
  ];
}

function fakeProvider(): Pick<
  AIProvider,
  "structureJobDescription" | "compareJDGapCriteria"
> {
  return {
    async structureJobDescription(input: JDStructureInput) {
      if (input.jdText.includes(e2eFixtureMarker)) {
        return {
          data: {
            jdTranslationZh: "E2E 测试岗位：包含可比专业、严格门槛、复合技能、量化成果和工作许可要求。",
            requirements: e2eStructureOutput(),
          },
          provider: fakeProviderName,
          model: fakeProviderModel,
          requestId: null,
          usage: {
            inputCacheHitTokens: 0,
            inputCacheMissTokens: 0,
            outputTokens: 0,
          },
        };
      }
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
          const factIds = criterion.kind === "tool" && criterion.originalText.includes("SQL")
            ? input.confirmedFacts
                .filter((fact) => /\bsql\b/iu.test(`${fact.title}\n${fact.description}`))
                .map((fact) => fact.id)
                .slice(0, 5)
            : [];
          const excerpt = criterion.kind === "quantified_outcome"
            ? /Improved checkout conversion by 18%/iu.exec(input.resumeText)?.[0] ?? null
            : criterion.kind === "language"
              ? /German\s+C1/iu.exec(input.resumeText)?.[0] ?? null
              : criterion.kind === "work_authorization"
                ? null
                : criterion.kind === "years_experience"
                  ? /(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+years?(?:\s+of)?\s+product analytics experience/iu.exec(input.resumeText)?.[0] ?? null
                : criterion.kind === "degree_field" &&
                    criterion.constraint.operator === "exact"
                  ? exactResumeExcerpt(
                      input.resumeText,
                      criterion.constraint.value ?? criterion.originalText,
                    )
                  : exactResumeExcerpt(input.resumeText, criterion.originalText);
          const needsConfirmation = criterion.kind === "work_authorization";
          return {
            criterionId: criterion.id,
            resumeEvidenceStatus: needsConfirmation
              ? "needs_confirmation" as const
              : excerpt
                ? "direct" as const
                : "none" as const,
            resumeExcerpt: needsConfirmation ? null : excerpt,
            profileFactIds: factIds,
            gapType: needsConfirmation
              ? "language_or_authorization_confirmation" as const
              : excerpt
                ? "none" as const
                : factIds.length
                  ? "missing_from_resume" as const
                  : "no_supporting_fact" as const,
            reasonZh: needsConfirmation
              ? "工作许可必须由用户确认，不能从普通简历措辞推断。"
              : excerpt
              ? "测试环境找到所选简历中的原文证据。"
              : factIds.length
                ? "职业档案有相关事实，但所选简历没有直接证据。"
                : "测试环境未在所选简历中找到直接证据。",
            userQuestionZh: excerpt && !needsConfirmation
              ? null
              : "你是否有可以确认或补充的相关事实？",
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
