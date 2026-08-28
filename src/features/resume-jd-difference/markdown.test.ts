import { describe, expect, it } from "vitest";

import type { ResumeJDDifferenceOutput } from "./schemas";
import {
  buildResumeJDDifferenceMarkdown,
  safeResumeJDDifferenceMarkdownFilename,
} from "./markdown";

const result: ResumeJDDifferenceOutput = {
  jobCore: {
    missionZh: "用数据支持业务决策。",
    coreCapabilities: ["业务分析", "SQL", "协作"],
    concepts: [{
      id: "concept-1",
      labelZh: "业务分析",
      originalTerms: ["business analysis"],
      importanceReasonZh: "核心职责。",
      priority: "critical",
    }],
    gates: [],
    preferredItems: [],
  },
  overallDifference: {
    summaryZh: "主要差异是岗位语言和结果证据。",
    topIssueIds: ["issue-1"],
  },
  issues: [
    {
      id: "issue-1",
      conceptId: "concept-1",
      jdOriginal: "Work with stakeholders | report insights.",
      jdTranslationZh: "与相关方协作并汇报洞察。",
      resumeExcerpt: "Worked with business teams.",
      resumeStatusZh: "存在相邻经历。",
      profileFactIds: [],
      type: "language_misaligned",
      problemZh: "岗位语言没有对齐。",
      reasonZh: "经历相邻，但表达未覆盖协作和汇报。",
      priority: "critical",
      isGate: false,
      authenticity: "supported",
    },
    {
      id: "issue-2",
      conceptId: null,
      jdOriginal: "German C1 is required.",
      jdTranslationZh: "要求德语 C1。",
      resumeExcerpt: null,
      resumeStatusZh: "当前材料未找到相关证据",
      profileFactIds: [],
      type: "gate",
      problemZh: "语言等级需要确认。",
      reasonZh: "简历未说明德语等级。",
      priority: "critical",
      isGate: true,
      authenticity: "unsupported",
    },
  ],
  matched: [{
    id: "matched-1",
    conceptId: "concept-1",
    jdOriginal: "Use SQL.",
    jdTranslationZh: "使用 SQL。",
    resumeExcerpt: "Used SQL for funnel analysis.",
    profileFactIds: [],
    reasonZh: "简历原文可回查。",
  }],
  directions: [{
    id: "direction-1",
    issueId: "issue-1",
    targetSection: "experience",
    targetExperienceZh: "数据分析经历",
    conceptId: "concept-1",
    jdTerms: ["stakeholder management"],
    focusAreas: ["action", "stakeholders", "result"],
    synonymousJobLanguage: ["business stakeholders"],
    authenticity: "supported",
    needsConfirmation: false,
    directionZh: "核对真实协作对象和结果使用场景。",
  }],
};

describe("resume JD difference Markdown", () => {
  it("exports the complete bounded analysis in the approved order", () => {
    const markdown = buildResumeJDDifferenceMarkdown({
      companyName: "Acme #1",
      roleTitle: "Data *Analyst*",
      exportedAt: new Date("2026-08-28T10:00:00.000Z"),
      sourceFilename: "../resume [final].pdf",
      stale: false,
      result,
    });

    const headings = [
      "## 岗位核心判断",
      "## 总体差异",
      "## 全部具体差异",
      "## 岗位门槛",
      "## 完善方向",
      "## 已匹配内容",
    ];
    for (let index = 1; index < headings.length; index += 1) {
      expect(markdown.indexOf(headings[index - 1])).toBeLessThan(
        markdown.indexOf(headings[index]),
      );
    }
    expect(markdown).toContain("Work with stakeholders \\| report insights.");
    expect(markdown).toContain("与相关方协作并汇报洞察。");
    expect(markdown).toContain("Worked with business teams.");
    expect(markdown).toContain("真实性：当前简历有可回查证据");
    expect(markdown).toContain("要求德语 C1。");
    expect(markdown).toContain("Used SQL for funnel analysis.");
    expect(markdown).not.toMatch(/inputHash|sourceSha256|factFingerprint|errorMessage|raw response/u);
  });

  it("marks an explicitly exported old result as potentially stale", () => {
    const markdown = buildResumeJDDifferenceMarkdown({
      companyName: "Acme",
      roleTitle: "Analyst",
      exportedAt: new Date("2026-08-28T10:00:00.000Z"),
      sourceFilename: "resume.pdf",
      stale: true,
      result,
    });
    expect(markdown).toContain("此结果可能已过期");
  });

  it("builds a safe, bounded filename", () => {
    expect(
      safeResumeJDDifferenceMarkdownFilename(
        "München / Acme",
        "Data:Analyst <Lead>",
      ),
    ).toBe("München-Acme-Data-Analyst-Lead-difference-analysis.md");
  });
});
