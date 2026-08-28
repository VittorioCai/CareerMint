import type {
  DifferenceAuthenticity,
  DifferenceIssue,
  ImprovementDirection,
  ResumeJDDifferenceOutput,
} from "./schemas";

export type ResumeJDDifferenceMarkdownInput = {
  companyName: string;
  roleTitle: string;
  exportedAt: Date;
  sourceFilename: string;
  stale: boolean;
  result: ResumeJDDifferenceOutput;
};

const authenticityCopy: Record<DifferenceAuthenticity, string> = {
  supported: "当前简历有可回查证据",
  profile_only: "职业档案有已确认事实，当前简历未体现",
  needs_confirmation: "需要本人确认",
  unsupported: "当前材料没有可回查证据",
};

const targetSectionCopy: Record<ImprovementDirection["targetSection"], string> = {
  summary: "个人总结",
  experience: "工作经历",
  project: "项目经历",
  skills: "技能",
  education: "教育",
  languages: "语言",
  other: "其他",
};

const focusCopy: Record<ImprovementDirection["focusAreas"][number], string> = {
  action: "动作",
  context: "场景",
  stakeholders: "协作对象",
  method: "方法",
  result: "结果",
  placement: "位置",
};

function escapeMarkdown(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\\/gu, "\\\\")
    .replace(/([`*_{}\[\]<>#+!|~-])/gu, "\\$1")
    .replace(/\s*\n\s*/gu, "<br>")
    .replace(/[\t ]+/gu, " ")
    .trim();
}

function safeDocumentName(value: string) {
  const name = value.replaceAll("\\", "/").split("/").pop() ?? "";
  return escapeMarkdown(name || "resume");
}

function issueBlock(issue: DifferenceIssue, index: number) {
  return [
    `### ${index + 1}. ${escapeMarkdown(issue.jdTranslationZh)}`,
    "",
    `- JD 原文：${escapeMarkdown(issue.jdOriginal)}`,
    `- 中文解释：${escapeMarkdown(issue.jdTranslationZh)}`,
    `- 简历现状：${escapeMarkdown(issue.resumeStatusZh)}`,
    `- 简历引用：${escapeMarkdown(issue.resumeExcerpt ?? "当前材料未找到相关证据")}`,
    `- 问题点：${escapeMarkdown(issue.problemZh)}`,
    `- 判断依据：${escapeMarkdown(issue.reasonZh)}`,
    `- 优先级：${escapeMarkdown(issue.priority)}`,
    `- 真实性：${escapeMarkdown(authenticityCopy[issue.authenticity])}`,
    "",
  ];
}

function directionBlock(
  direction: ImprovementDirection,
  issue: DifferenceIssue | undefined,
  index: number,
) {
  const target = direction.targetExperienceZh
    ? `${targetSectionCopy[direction.targetSection]} · ${direction.targetExperienceZh}`
    : targetSectionCopy[direction.targetSection];
  const terms =
    direction.authenticity === "unsupported"
      ? []
      : [...new Set([...direction.jdTerms, ...direction.synonymousJobLanguage])];
  return [
    `### ${index + 1}. ${escapeMarkdown(issue?.jdTranslationZh ?? "对应差异")}`,
    "",
    `- 目标位置：${escapeMarkdown(target)}`,
    `- 完善重点：${escapeMarkdown(direction.focusAreas.map((area) => focusCopy[area]).join(" · ") || "核实真实经历")}`,
    ...(terms.length
      ? [`- 岗位原词 / 同义表达：${terms.map(escapeMarkdown).join("；")}`]
      : []),
    `- 真实性：${escapeMarkdown(authenticityCopy[direction.authenticity])}`,
    `- 方向说明：${escapeMarkdown(direction.directionZh)}`,
    ...(direction.authenticity === "unsupported"
      ? ["- 提醒：如未实际做过，请不要加入简历。"]
      : []),
    "",
  ];
}

function jobCore(result: ResumeJDDifferenceOutput) {
  return [
    "## 岗位核心判断",
    "",
    escapeMarkdown(result.jobCore.missionZh),
    "",
    ...result.jobCore.coreCapabilities.map(
      (capability) => `- ${escapeMarkdown(capability)}`,
    ),
    "",
  ];
}

export function buildResumeJDDifferenceMarkdown(
  input: ResumeJDDifferenceMarkdownInput,
) {
  const issues = input.result.issues.filter((issue) => !issue.isGate);
  const gates = input.result.issues.filter((issue) => issue.isGate);
  const issueById = new Map(input.result.issues.map((issue) => [issue.id, issue]));
  const lines = [
    `# ${escapeMarkdown(input.companyName)} · ${escapeMarkdown(input.roleTitle)} — 差异分析`,
    "",
    `- 导出时间：${input.exportedAt.toISOString()}`,
    `- 对照简历：${safeDocumentName(input.sourceFilename)}`,
    `- 结果状态：${input.stale ? "此结果可能已过期；材料变化后请重新分析。" : "基于导出时选定材料。"}`,
    "",
    ...jobCore(input.result),
    "## 总体差异",
    "",
    escapeMarkdown(input.result.overallDifference.summaryZh),
    "",
    "## 全部具体差异",
    "",
    ...(issues.length
      ? issues.flatMap(issueBlock)
      : ["当前没有识别出一般差异。", ""]),
    "## 岗位门槛",
    "",
    ...(gates.length
      ? gates.flatMap(issueBlock)
      : ["当前没有识别出需要单独确认的岗位门槛。", ""]),
    "## 完善方向",
    "",
    ...(input.result.directions.length
      ? input.result.directions.flatMap((direction, index) =>
          directionBlock(direction, issueById.get(direction.issueId), index),
        )
      : ["当前没有可发布的完善方向。", ""]),
    "## 已匹配内容",
    "",
    ...input.result.matched.flatMap((item, index) => [
      `### ${index + 1}. ${escapeMarkdown(item.jdTranslationZh)}`,
      "",
      `- JD 原文：${escapeMarkdown(item.jdOriginal)}`,
      `- 简历引用：${escapeMarkdown(item.resumeExcerpt)}`,
      `- 判断依据：${escapeMarkdown(item.reasonZh)}`,
      "- 真实性：当前简历有可回查证据",
      "",
    ]),
  ];
  if (!input.result.matched.length) lines.push("当前没有已发布的匹配内容。", "");
  return `${lines.join("\n").trim()}\n`;
}

export function safeResumeJDDifferenceMarkdownFilename(
  companyName: string,
  roleTitle: string,
) {
  const base = `${companyName}-${roleTitle}`
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .replace(/[\\/:*?"<>|]/gu, "-")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 160)
    .replace(/-$/gu, "");
  return `${base || "application"}-difference-analysis.md`;
}
