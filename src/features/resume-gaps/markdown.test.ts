import { describe, expect, it } from "vitest";

import {
  buildResumeGapMarkdown,
  safeMarkdownFilename,
} from "./markdown";

const report = {
  companyName: "Acme | Europe",
  roleTitle: "Product `Lead`",
  exportedAt: new Date("2026-08-25T08:30:00.000Z"),
  baselineFilename: "Vittorio CV.pdf",
  items: [
    {
      requirementText: "Lead product discovery",
      translationZh: "推动产品探索",
      priority: "core" as const,
      matchStatus: "none" as const,
      resumeCoverage: "missing" as const,
      verifiedResumeExcerpt: null,
      profileEvidence: [],
      sortOrder: 0,
    },
    {
      requirementText: "Advanced SQL",
      translationZh: "高级 SQL",
      priority: "core" as const,
      matchStatus: "evidence" as const,
      resumeCoverage: "missing" as const,
      verifiedResumeExcerpt: null,
      profileEvidence: [
        {
          title: "SQL 项目",
          description: "搭建经营分析看板。",
          sourceExcerpt: "Built reporting dashboards.",
        },
      ],
      sortOrder: 1,
    },
    {
      requirementText: "Stakeholder communication",
      translationZh: "利益相关方沟通",
      priority: "supporting" as const,
      matchStatus: "partial" as const,
      resumeCoverage: "partial" as const,
      verifiedResumeExcerpt: "Presented weekly findings.",
      profileEvidence: [],
      sortOrder: 2,
    },
    {
      requirementText: "Excel",
      translationZh: "Excel",
      priority: "supporting" as const,
      matchStatus: "evidence" as const,
      resumeCoverage: "covered" as const,
      verifiedResumeExcerpt: "Excel",
      profileEvidence: [],
      sortOrder: 3,
    },
  ],
};

describe("resume gap Markdown", () => {
  it("exports only unresolved content with original, Chinese, priority, and exact evidence", () => {
    const markdown = buildResumeGapMarkdown(report);

    expect(markdown).toContain("Acme \\| Europe");
    expect(markdown).toContain("Product \\`Lead\\`");
    expect(markdown).toContain("2026-08-25");
    expect(markdown).toContain("Vittorio CV.pdf");
    expect(markdown).toContain("Lead product discovery");
    expect(markdown).toContain("推动产品探索");
    expect(markdown).toContain("Advanced SQL");
    expect(markdown).toContain("SQL 项目");
    expect(markdown).toContain("Built reporting dashboards.");
    expect(markdown).toContain("Presented weekly findings.");
    expect(markdown).not.toContain("\nExcel\n");
    expect(markdown).not.toContain("建议改写");
    expect(markdown.indexOf("Lead product discovery")).toBeLessThan(
      markdown.indexOf("Advanced SQL"),
    );
  });

  it("builds a safe, bounded Markdown filename", () => {
    expect(safeMarkdownFilename("Acme/Europe", "Product: Lead")).toBe(
      "Acme-Europe-Product-Lead-resume-gap.md",
    );
    expect(safeMarkdownFilename("  ", "<>" )).toBe("resume-gap.md");
    expect(safeMarkdownFilename("x".repeat(300), "Role").length).toBeLessThanOrEqual(120);
  });
});
