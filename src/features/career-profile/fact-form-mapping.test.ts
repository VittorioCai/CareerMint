import { describe, expect, it } from "vitest";

import { mapFactFormValues } from "./fact-form-mapping";
import type { CareerFactInput } from "./schemas";

describe("mapFactFormValues", () => {
  it.each<{ name: string; input: Parameters<typeof mapFactFormValues>; expected: CareerFactInput }>([
    {
      name: "personal summary",
      input: ["summary", { headline: "数据分析师", summary: "擅长把业务问题转成可衡量的分析。" }],
      expected: { factType: "summary", data: { title: "数据分析师", organization: null, startDate: null, endDate: null, description: "擅长把业务问题转成可衡量的分析。", skills: [] } },
    },
    {
      name: "work experience",
      input: ["work_experience", { role: "产品分析师", company: "Acme", startDate: "2024-01", endDate: "2025-06", responsibilities: "负责增长漏斗并提升转化率。", skills: "SQL，Tableau" }],
      expected: { factType: "work_experience", data: { title: "产品分析师", organization: "Acme", startDate: "2024-01", endDate: "2025-06", description: "负责增长漏斗并提升转化率。", skills: ["SQL", "Tableau"] } },
    },
    {
      name: "education",
      input: ["education", { degree: "管理学硕士", school: "TUM", startDate: "2023", endDate: "2025", educationDetails: "数字技术方向。" }],
      expected: { factType: "education", data: { title: "管理学硕士", organization: "TUM", startDate: "2023", endDate: "2025", description: "数字技术方向。", skills: [] } },
    },
    {
      name: "project",
      input: ["project", { projectName: "留存分析", projectOrganization: "课程项目", startDate: "2025-01", endDate: "2025-03", contribution: "搭建分群模型。", skills: "Python, SQL" }],
      expected: { factType: "project", data: { title: "留存分析", organization: "课程项目", startDate: "2025-01", endDate: "2025-03", description: "搭建分群模型。", skills: ["Python", "SQL"] } },
    },
    {
      name: "skill",
      input: ["skill", { skillName: "SQL", proficiencyContext: "熟练；用于漏斗和留存分析。" }],
      expected: { factType: "skill", data: { title: "SQL", organization: null, startDate: null, endDate: null, description: "熟练；用于漏斗和留存分析。", skills: ["SQL"] } },
    },
    {
      name: "certification",
      input: ["certification", { certificateName: "Google Data Analytics", issuer: "Google", obtainedDate: "2024-06", credentialDetails: "Credential ID 123" }],
      expected: { factType: "certification", data: { title: "Google Data Analytics", organization: "Google", startDate: "2024-06", endDate: null, description: "Credential ID 123", skills: [] } },
    },
    {
      name: "language without generic company, dates, or skills",
      input: ["language", { language: "德语", proficiency: "B2", languageEvidence: "Goethe-Zertifikat B2", company: "不应保存", startDate: "2020", skills: "不应保存" }],
      expected: { factType: "language", data: { title: "德语", organization: null, startDate: null, endDate: null, description: "熟练程度：B2\n证书或证明：Goethe-Zertifikat B2", skills: [] } },
    },
    {
      name: "quantified achievement",
      input: ["achievement", { outcome: "缩短周报时间", metric: "从 6 小时降至 45 分钟", achievementContext: "自动化数据清洗与看板更新。" }],
      expected: { factType: "achievement", data: { title: "缩短周报时间", organization: null, startDate: null, endDate: null, description: "指标：从 6 小时降至 45 分钟\n背景：自动化数据清洗与看板更新。", skills: [] } },
    },
    {
      name: "STAR story",
      input: ["story", { storyTitle: "挽救延期项目", situation: "项目延期。", task: "两周内恢复节奏。", action: "重排范围并建立每日同步。", result: "按新日期上线。" }],
      expected: { factType: "story", data: { title: "挽救延期项目", organization: null, startDate: null, endDate: null, description: "情境：项目延期。\n任务：两周内恢复节奏。\n行动：重排范围并建立每日同步。\n结果：按新日期上线。", skills: [] } },
    },
  ])("maps $name into the normalized storage shape", ({ input, expected }) => {
    expect(mapFactFormValues(...input)).toEqual(expected);
  });

  it("identifies the category-specific missing field", () => {
    expect(() => mapFactFormValues("language", { language: "德语" })).toThrowError(
      expect.objectContaining({ field: "proficiency" }),
    );
  });
});
