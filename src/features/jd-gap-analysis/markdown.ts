import type {
  CoverageStatus,
  CriterionEvidenceStatus,
  GapType,
  ImpactLevel,
} from "./schemas";

type MarkdownFact = {
  id: string;
  title: string;
  description: string;
  sourceExcerpt: string | null;
};

type MarkdownAssessment = {
  resumeEvidenceStatus: CriterionEvidenceStatus;
  resumeExcerpt: string | null;
  gapType: GapType;
  reasonZh: string;
  userQuestionZh: string | null;
  profileFacts: MarkdownFact[];
  [key: string]: unknown;
};

type MarkdownCriterion = {
  id: string;
  translationZh: string;
  originalText: string;
  assessment: MarkdownAssessment | null;
};

export type JDGapMarkdownRequirement = {
  id: string;
  translationZh: string;
  originalText: string;
  sortOrder: number;
  result: {
    coverageStatus: CoverageStatus;
    impactLevel: ImpactLevel;
    coveredCriterionCount: number;
    missingCriterionCount: number;
  } | null;
  criteria: MarkdownCriterion[];
};

export type JDGapMarkdownInput = {
  companyName: string;
  roleTitle: string;
  exportedAt: Date;
  baselineFilename: string;
  requirements: JDGapMarkdownRequirement[];
  [key: string]: unknown;
};

const impactOrder: ImpactLevel[] = ["blocking", "important", "minor"];
const coverageOrder: CoverageStatus[] = [
  "none",
  "needs_confirmation",
  "partial",
  "complete",
];

const coverageCopy: Record<CoverageStatus, string> = {
  complete: "完全匹配",
  partial: "部分匹配",
  none: "未覆盖",
  needs_confirmation: "需要确认",
};

const impactCopy: Record<ImpactLevel, string> = {
  blocking: "阻断项",
  important: "重要项",
  minor: "次要项",
};

const evidenceCopy: Record<CriterionEvidenceStatus, string> = {
  direct: "已覆盖",
  partial_direct: "部分覆盖",
  none: "未覆盖",
  needs_confirmation: "需要确认",
};

const gapTypeCopy: Record<GapType, string> = {
  missing_from_resume: "简历未体现",
  too_vague: "表述过于笼统",
  missing_result_or_number: "缺少结果或数字",
  no_supporting_fact: "职业档案也没有支持事实",
  language_or_authorization_confirmation: "语言或工作许可需要确认",
  none: "没有差距",
};

function markdownText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/([`*_[\]{}()<>#+!|])/gu, "\\$1")
    .replace(/\r?\n/gu, "<br>");
}

function requirementOrder(
  left: JDGapMarkdownRequirement,
  right: JDGapMarkdownRequirement,
) {
  const leftImpact = left.result?.impactLevel ?? "important";
  const rightImpact = right.result?.impactLevel ?? "important";
  const leftCoverage = left.result?.coverageStatus ?? "needs_confirmation";
  const rightCoverage = right.result?.coverageStatus ?? "needs_confirmation";
  return (
    impactOrder.indexOf(leftImpact) - impactOrder.indexOf(rightImpact) ||
    coverageOrder.indexOf(leftCoverage) - coverageOrder.indexOf(rightCoverage) ||
    left.sortOrder - right.sortOrder ||
    left.id.localeCompare(right.id)
  );
}

function renderCriterion(
  criterion: MarkdownCriterion,
  index: number,
) {
  const assessment = criterion.assessment;
  const lines = [
    `#### 条件 ${index + 1}：${markdownText(criterion.translationZh)}`,
    "",
    `- 原文：${markdownText(criterion.originalText)}`,
    `- 条件状态：${assessment ? evidenceCopy[assessment.resumeEvidenceStatus] : "尚未核对"}`,
  ];

  if (assessment?.resumeExcerpt) {
    lines.push(`- 简历证据：${markdownText(assessment.resumeExcerpt)}`);
  }
  for (const fact of assessment?.profileFacts ?? []) {
    const source = fact.sourceExcerpt
      ? ` — 来源：${markdownText(fact.sourceExcerpt)}`
      : "";
    lines.push(
      `- 职业档案证据：${markdownText(fact.title)} — ${markdownText(fact.description)}${source}`,
    );
  }
  if (assessment) {
    lines.push(`- 差距类型：${gapTypeCopy[assessment.gapType]}`);
    lines.push(`- 判断理由：${markdownText(assessment.reasonZh)}`);
    if (assessment.userQuestionZh) {
      lines.push(`- 建议确认：${markdownText(assessment.userQuestionZh)}`);
    }
  }
  return lines.join("\n");
}

export function buildJDGapMarkdown(input: JDGapMarkdownInput) {
  const unresolved = input.requirements
    .filter((requirement) => requirement.result?.coverageStatus !== "complete")
    .sort(requirementOrder);
  const lines = [
    `# ${markdownText(input.companyName)} — ${markdownText(input.roleTitle)}：JD 差距分析`,
    "",
    `- 导出时间：${input.exportedAt.toISOString()}`,
    `- 对照简历：${markdownText(input.baselineFilename)}`,
    `- 待补要求：${unresolved.length}`,
    "",
    "> 此文件只包含当前未解决的 JD 差距及已核实证据，不包含完整 JD 或完整简历。",
  ];

  if (unresolved.length === 0) {
    lines.push("", "当前没有待补差距。");
    return `${lines.join("\n")}\n`;
  }

  unresolved.forEach((requirement, index) => {
    const result = requirement.result;
    const requirementCoverage = result?.coverageStatus ?? "needs_confirmation";
    const requirementImpact = result?.impactLevel ?? "important";
    lines.push(
      "",
      `## ${index + 1}. ${markdownText(requirement.translationZh)}`,
      "",
      `- 原文：${markdownText(requirement.originalText)}`,
      `- 匹配程度：${coverageCopy[requirementCoverage]}`,
      `- 影响程度：${impactCopy[requirementImpact]}`,
      `- 已覆盖条件：${result?.coveredCriterionCount ?? 0}；待补条件：${result?.missingCriterionCount ?? requirement.criteria.length}`,
    );
    requirement.criteria.forEach((criterion, criterionIndex) => {
      lines.push("", renderCriterion(criterion, criterionIndex));
    });
  });

  return `${lines.join("\n")}\n`;
}

export function safeJDGapMarkdownFilename(companyName: string, roleTitle: string) {
  const base = `${companyName}-${roleTitle}`
    .normalize("NFKC")
    .replace(/[\\/<>:"|?*\u0000-\u001f\u007f]+/gu, "-")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 140);
  return `${base || "application"}-jd-gap.md`;
}
