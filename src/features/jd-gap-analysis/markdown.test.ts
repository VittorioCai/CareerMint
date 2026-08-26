import { describe, expect, it } from "vitest";

import { buildJDGapMarkdown, safeJDGapMarkdownFilename } from "./markdown";

describe("buildJDGapMarkdown", () => {
  it("exports unresolved requirements in UI order with bounded evidence only", () => {
    const markdown = buildJDGapMarkdown({
      companyName: "Acme *Labs*",
      roleTitle: "Data [Analyst]",
      exportedAt: new Date("2026-08-26T10:00:00.000Z"),
      baselineFilename: "Vittorio_Cai_CV.pdf",
      requirements: [
        {
          id: "complete",
          translationZh: "完整匹配要求",
          originalText: "Complete requirement",
          sortOrder: 0,
          result: {
            coverageStatus: "complete",
            impactLevel: "blocking",
            coveredCriterionCount: 1,
            missingCriterionCount: 0,
          },
          criteria: [],
        },
        {
          id: "partial",
          translationZh: "需要更明确的数据分析成果",
          originalText: "Demonstrated analytics outcomes",
          sortOrder: 1,
          result: {
            coverageStatus: "partial",
            impactLevel: "blocking",
            coveredCriterionCount: 1,
            missingCriterionCount: 1,
          },
          criteria: [{
            id: "criterion-partial",
            translationZh: "提供量化的数据分析成果",
            originalText: "Quantified analytics outcome",
            assessment: {
              resumeEvidenceStatus: "partial_direct",
              resumeExcerpt: "Built SQL dashboards for monthly reporting.",
              gapType: "missing_result_or_number",
              reasonZh: "简历证明做过分析，但没有结果数字。",
              userQuestionZh: "是否有可核实的效率或业务结果？",
              profileFacts: [{
                id: "fact-existing",
                title: "数据分析项目",
                description: "使用 SQL 制作月度看板。",
                sourceExcerpt: "SQL monthly dashboard",
              }],
              profileFactIds: ["fact-existing", "fact-deleted"],
            },
          }],
        },
        {
          id: "missing-important",
          translationZh: "需要德语 C1",
          originalText: "German C1 required",
          sortOrder: 2,
          result: {
            coverageStatus: "none",
            impactLevel: "important",
            coveredCriterionCount: 0,
            missingCriterionCount: 1,
          },
          criteria: [{
            id: "criterion-missing",
            translationZh: "德语达到 C1",
            originalText: "German at C1 level",
            assessment: {
              resumeEvidenceStatus: "none",
              resumeExcerpt: null,
              gapType: "language_or_authorization_confirmation",
              reasonZh: "当前简历没有德语等级证据。",
              userQuestionZh: "你的德语是否已达到 C1？",
              profileFacts: [],
            },
          }],
        },
        {
          id: "missing-blocking",
          translationZh: "必须具备工作许可",
          originalText: "Valid work authorization required",
          sortOrder: 3,
          result: {
            coverageStatus: "none",
            impactLevel: "blocking",
            coveredCriterionCount: 0,
            missingCriterionCount: 1,
          },
          criteria: [{
            id: "criterion-blocking",
            translationZh: "拥有有效工作许可",
            originalText: "Valid work authorization",
            assessment: {
              resumeEvidenceStatus: "needs_confirmation",
              resumeExcerpt: null,
              gapType: "language_or_authorization_confirmation",
              reasonZh: "需要本人确认，不能从简历推断。",
              userQuestionZh: "你目前是否拥有有效工作许可？",
              profileFacts: [],
            },
          }],
        },
      ],
      fullJdText: "FULL JD MUST NOT EXPORT",
      fullResumeText: "FULL RESUME MUST NOT EXPORT",
      signedUrl: "https://private.example/signed",
    });

    expect(markdown).toContain("# Acme \\*Labs\\* — Data \\[Analyst\\]：JD 差距分析");
    expect(markdown).toContain("- 对照简历：Vittorio\\_Cai\\_CV.pdf");
    expect(markdown).toContain("- 匹配程度：未覆盖");
    expect(markdown).toContain("- 影响程度：阻断项");
    expect(markdown).toContain("- 已覆盖条件：1；待补条件：1");
    expect(markdown).toContain("- 简历证据：Built SQL dashboards for monthly reporting.");
    expect(markdown).toContain("- 职业档案证据：数据分析项目 — 使用 SQL 制作月度看板。 — 来源：SQL monthly dashboard");
    expect(markdown).toContain("- 差距类型：缺少结果或数字");
    expect(markdown).toContain("- 建议确认：是否有可核实的效率或业务结果？");

    expect(markdown.indexOf("必须具备工作许可")).toBeLessThan(
      markdown.indexOf("需要更明确的数据分析成果"),
    );
    expect(markdown.indexOf("需要更明确的数据分析成果")).toBeLessThan(
      markdown.indexOf("需要德语 C1"),
    );
    expect(markdown).not.toContain("完整匹配要求");
    expect(markdown).not.toContain("fact-deleted");
    expect(markdown).not.toContain("FULL JD MUST NOT EXPORT");
    expect(markdown).not.toContain("FULL RESUME MUST NOT EXPORT");
    expect(markdown).not.toContain("private.example");
  });

  it("creates a portable filename", () => {
    expect(safeJDGapMarkdownFilename("Acme / GmbH", "Data:Analyst")).toBe(
      "Acme-GmbH-Data-Analyst-jd-gap.md",
    );
  });
});
