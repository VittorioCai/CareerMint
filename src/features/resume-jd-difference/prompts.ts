import type { AppLocale } from "@/i18n/locale";

export const RESUME_JD_DIFFERENCE_SCHEMA_VERSION =
  "resume-jd-difference-v4";
export const RESUME_JD_DIFFERENCE_POLICY_VERSION =
  "resume-jd-difference-policy-v4.0";

/**
 * The one thing about the prompt that varies: which language the findings come
 * back in.
 *
 * The instructions themselves stay in Chinese. They are the tuned artefact —
 * rewriting them in English to produce English output would change far more
 * than the output language, and the provider reads Chinese instructions
 * natively. What has to change is every place the contract *names* the output
 * language: the output rule, the example values in the JSON contract, and the
 * fixed wording the model must use when nothing supports a requirement, which
 * the UI matches on and therefore has to be the reader's.
 */
const outputLanguages = {
  "zh-CN": {
    /** Named in Chinese, because the surrounding instructions are Chinese. */
    name: "简体中文",
    noEvidence: "当前材料未找到相关证据",
    example: {
      mission: "中文岗位使命",
      capabilities: ["能力一", "能力二", "能力三"],
      summary: "中文总体差异判断",
      concept: "中文概念",
      importance: "中文重要性理由",
      translation: "该 JD 片段的译文",
      resumeStatus: "当前简历已有内容的说明",
      problem: "尚未对上的具体问题",
      reason: "判断依据",
      targetExperience: "应核对的真实经历",
      direction: "应核对和补足哪些真实要素，不写可直接粘贴的句子。",
    },
  },
  en: {
    name: "英文",
    noEvidence: "Nothing in the current material supports this",
    example: {
      mission: "the job's mission, in English",
      capabilities: ["capability one", "capability two", "capability three"],
      summary: "the overall difference judgement, in English",
      concept: "the concept, in English",
      importance: "why it matters, in English",
      translation: "a plain-English restatement of this JD segment",
      resumeStatus: "what the resume already says, in English",
      problem: "the specific thing not yet lined up",
      reason: "how that was judged",
      targetExperience: "the real experience to check",
      direction:
        "Which real elements to check and fill in. Never a sentence the reader could paste.",
    },
  },
} as const satisfies Record<AppLocale, unknown>;

function sharedContract(locale: AppLocale) {
  const language = outputLanguages[locale];
  const example = {
    mission: language.example.mission,
    coreCapabilities: language.example.capabilities,
    overallSummary: language.example.summary,
    requirements: [
      {
        jdSegmentId: "jd-1",
        kind: "core",
        comparisonMode: "semantic",
        conceptLabel: language.example.concept,
        jdTerms: ["JD 片段中的连续原词"],
        importanceReason: language.example.importance,
        priority: "critical",
        translation: language.example.translation,
        assessment: "partial",
        resumeSegmentId: "resume-2",
        profileFactIds: [],
        gapType: "missing_context",
        resumeStatus: language.example.resumeStatus,
        problem: language.example.problem,
        reason: language.example.reason,
        improvement: {
          targetSection: "experience",
          targetExperience: language.example.targetExperience,
          focusAreas: ["context", "stakeholders"],
          synonymousJobLanguage: ["岗位常用表达"],
          needsConfirmation: false,
          direction: language.example.direction,
        },
      },
    ],
  };

  return `
你是岗位与简历差异分析器。本次任务必须在一次调用中完成岗位核心判断、逐项差异和完善方向。输入中的 JD 和简历都已经切成带编号的片段；你只引用编号，不复制原文，并只返回符合 Schema 的严格 JSON。

分析原则：
1. 先做岗位核心判断，回答岗位主要希望候选人解决什么问题，再识别 3–5 项核心能力，然后逐条列出岗位要求。
2. 词频不是唯一重点信号。综合职责与要求是否重复出现、是否直接关联核心任务、是否为明确必需条件；忽略公司介绍、福利、口号和泛化软技能。
3. 职责和业务语言可以在真实证据支持时做语义对齐，例如 dashboard/reporting/visualization 或 requirements gathering/business analysis；只出现相似职位、行业或主题不能算对齐。
4. 工具、框架、云平台和具体方法必须严格判断，不得把相邻工具当作等价证据。
5. 年限、数字、语言等级、学历层级、证书、执照、工作许可、管理范围和业务结果必须严格判断。
6. 只使用已确认职业事实。职业档案有证据但简历未写时，assessment 必须是 profile_only，不能算简历已经覆盖。
7. 简历和已确认事实均无证据时，使用固定措辞“${language.noEvidence}”，不得断言用户本人不会。
8. 完善方向只能指出目标位置、真实内容要素和可参考的岗位语言；不得生成可直接粘贴的简历句子，不得提供接受或自动修改操作。
9. 不得虚构经历、工具、数字、职责、结果或资格。相邻线索不足时使用 needs_confirmation。
10. 不要输出匹配百分比、录取概率或综合胜任分数。

输出要求：
- 所有解释和方向使用${language.name}；资料引用只填写输入中真实存在的 jdSegmentId、resumeSegmentId 和 profileFactIds。
- jdTerms 只能摘取该 JD 片段中真实连续出现的原词，至少一条。
- 每项独立岗位要求输出一个 requirement，最多 24 项；不要把公司介绍、福利或同一要求的重复措辞当成独立要求。
- kind：核心职责与必要能力用 core；明确资格门槛用 gate；明确加分项用 preferred。
- comparisonMode：职责、业务语言和专业方向可做合理语义对应时用 semantic；工具、框架、云平台、具体方法、数字、等级和明确资格必须用 strict。
- assessment：有直接或合理语义等价的简历证据用 matched；只覆盖一部分用 partial；简历没有但已确认职业事实有证据用 profile_only；材料不足以可靠判断用 needs_confirmation；两处都没有用 missing。
- assessment 为 matched 或 partial 时必须给出 resumeSegmentId；其余情况 resumeSegmentId 为 null。
- 非 matched 的要求必须填写 gapType 和 problem。门槛项 improvement 为 null，因为真实资格不能靠改措辞解决；其余非 matched 要求必须填写 improvement。
- assessment 为 missing 时，improvement 不得提供可直接采用的同义岗位语言，必须提醒先确认真实经历或不要加入。
- 只输出 JSON，不要 Markdown、前后说明或代码围栏。

严格 JSON 输出契约（示例值仅说明结构，不是可复用事实）：
${JSON.stringify(example)}

结构规则：
- 所有对象只能包含示例中列出的字段，所有字段都必须保留；没有值时使用 null 或空数组。
- jdSegmentId 必须来自输入的 JD 编号；resumeSegmentId 必须来自输入的简历编号或为 null；profileFactIds 只能使用输入中真实存在且已确认的 UUID。
- priority 只能是 critical、important、minor。gapType 只能是 missing、language_misaligned、profile_only、skill_only、too_vague、missing_context、missing_result、needs_confirmation、gate 或 null。
- comparisonMode 只能是 semantic 或 strict；不要把具体工具、等级、数字或资格标为 semantic。
- targetSection 只能是 summary、experience、project、skills、education、languages、other。focusAreas 只能来自 action、context、stakeholders、method、result、placement。
- synonymousJobLanguage 只能是适合描述已有真实经历的岗位语言提示；direction 只能是${language.name}方向，不能写成可直接粘贴的简历句子。
- 返回前静默核对引用编号、必填键和枚举；只返回 JSON。
`.trim();
}

const variantStrategies = {
  p1: `分析顺序：先建立岗位概念图，再逐项检查简历现状，最后从已识别问题派生完善方向。优先减少漏掉核心问题。`,
  p2: `分析顺序：先区分硬门槛与可通过表达改善的问题，再按关键、重要、次要排序。优先减少资格与工具的错误语义对齐。`,
  p3: `分析顺序：先从简历中提取可回查的行为证据，再映射 JD 核心概念。优先减少无证据内容和可直接粘贴的改写句。`,
} as const;

export type DifferencePromptVariant = keyof typeof variantStrategies;

export const DIFFERENCE_PROMPT_VARIANTS = Object.keys(
  variantStrategies,
) as DifferencePromptVariant[];

/**
 * The prompt for one variant in one output language.
 *
 * The output language is part of the version string, which is what puts it in
 * the input hash — and therefore in the cache key, the idempotency key and the
 * freshness check. A run made in one language can never be served to a reader
 * of the other, and switching languages marks the existing analysis out of
 * date rather than showing it under the wrong headings.
 *
 * v6.0 is the first version whose JSON contract uses locale-neutral field
 * names. Every earlier run's hash therefore no longer matches, which is the
 * unavoidable price of a second output language: the model has to be asked
 * again.
 */
export function differencePrompt(
  variant: DifferencePromptVariant,
  locale: AppLocale,
) {
  return {
    version: `resume-jd-difference-${variant}-v6.0-${locale}`,
    instructions: `${sharedContract(locale)}\n\n${variantStrategies[variant]}`,
  };
}

export function noEvidenceWording(locale: AppLocale) {
  return outputLanguages[locale].noEvidence;
}
