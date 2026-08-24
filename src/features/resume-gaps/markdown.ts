import { compareRequirements } from "@/features/jd-analysis/requirement-order";
import type { RequirementMatchStatus } from "@/features/jd-analysis/schemas";

type MarkdownFact = {
  title: string;
  description: string;
  sourceExcerpt: string | null;
};

export type ResumeGapMarkdownItem = {
  requirementText: string;
  translationZh?: string | null;
  priority: "core" | "supporting";
  matchStatus?: RequirementMatchStatus;
  resumeCoverage: "covered" | "partial" | "missing";
  verifiedResumeExcerpt: string | null;
  profileEvidence: MarkdownFact[];
  sortOrder: number;
};

export type ResumeGapMarkdownReport = {
  companyName: string;
  roleTitle: string;
  exportedAt: Date;
  baselineFilename: string;
  items: ResumeGapMarkdownItem[];
};

type ExportGroup = "missing_evidence" | "resume_omission" | "partial_coverage";

const groupLabels: Record<ExportGroup, string> = {
  missing_evidence: "缺少证据",
  resume_omission: "简历漏写",
  partial_coverage: "部分覆盖",
};

function markdownText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]{}()<>#+!|])/g, "\\$1")
    .replace(/\r?\n/g, "<br>")
    .trim();
}

function quote(value: string) {
  return markdownText(value)
    .split("<br>")
    .map((line) => `> ${line}`)
    .join("\n");
}

function exportGroup(item: ResumeGapMarkdownItem): ExportGroup | null {
  if (item.resumeCoverage === "covered") return null;
  if (item.resumeCoverage === "partial") return "partial_coverage";
  return item.profileEvidence.length > 0
    ? "resume_omission"
    : "missing_evidence";
}

function ordered(items: ResumeGapMarkdownItem[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        compareRequirements(
          {
            matchStatus: left.item.matchStatus ?? "none",
            priority: left.item.priority,
            sortOrder: left.item.sortOrder,
          },
          {
            matchStatus: right.item.matchStatus ?? "none",
            priority: right.item.priority,
            sortOrder: right.item.sortOrder,
          },
        ) || left.index - right.index,
    )
    .map(({ item }) => item);
}

export function buildResumeGapMarkdown(report: ResumeGapMarkdownReport) {
  const sections: string[] = [
    "# 简历差距整理",
    "",
    `- 公司：${markdownText(report.companyName)}`,
    `- 职位：${markdownText(report.roleTitle)}`,
    `- 对照简历：${markdownText(report.baselineFilename)}`,
    `- 导出日期：${report.exportedAt.toISOString().slice(0, 10)}`,
    "",
    "> 本文件只整理当前 JD 与当前对照简历中仍未解决的差距，不生成或改写经历。",
  ];

  const unresolved = ordered(report.items).filter(
    (item) => exportGroup(item) !== null,
  );
  const groups: ExportGroup[] = [
    "missing_evidence",
    "resume_omission",
    "partial_coverage",
  ];

  for (const group of groups) {
    const items = unresolved.filter((item) => exportGroup(item) === group);
    if (items.length === 0) continue;
    sections.push("", `## ${groupLabels[group]}`);
    items.forEach((item, index) => {
      sections.push(
        "",
        `### ${index + 1}. ${markdownText(item.requirementText)}`,
        "",
        `- 中文：${markdownText(item.translationZh ?? "历史分析未保存中文翻译")}`,
        `- 优先级：${item.priority === "core" ? "核心" : "补充"}`,
      );
      if (item.verifiedResumeExcerpt) {
        sections.push("", "当前简历摘录：", "", quote(item.verifiedResumeExcerpt));
      }
      if (item.profileEvidence.length > 0) {
        sections.push("", "已确认职业事实：");
        item.profileEvidence.forEach((fact) => {
          sections.push(
            "",
            `- ${markdownText(fact.title)}：${markdownText(fact.description)}`,
          );
          if (fact.sourceExcerpt) {
            sections.push("", quote(fact.sourceExcerpt));
          }
        });
      }
    });
  }

  if (unresolved.length === 0) {
    sections.push("", "## 当前没有未解决差距");
  }

  return `${sections.join("\n")}\n`;
}

export function safeMarkdownFilename(companyName: string, roleTitle: string) {
  const base = [companyName, roleTitle]
    .map((value) =>
      value
        .normalize("NFKC")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean)
    .join("-");
  const suffix = "-resume-gap.md";
  if (!base) return "resume-gap.md";
  return `${base.slice(0, 120 - suffix.length).replace(/-$/g, "")}${suffix}`;
}
