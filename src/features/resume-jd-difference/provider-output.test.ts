import { describe, expect, it } from "vitest";

import {
  buildSourceSegments,
  materializeResumeJDDifferenceOutput,
  resumeJDDifferenceProviderOutputSchema,
} from "./provider-output";

const factId = "11111111-1111-4111-8111-111111111111";

describe("resume JD compact provider protocol", () => {
  it("turns source documents into stable, exact, bounded references", () => {
    const segments = buildSourceSegments(
      "First requirement. Second requirement!\nThird requirement",
      "jd",
    );

    expect(segments).toEqual([
      { id: "jd-1", text: "First requirement." },
      { id: "jd-2", text: "Second requirement!" },
      { id: "jd-3", text: "Third requirement" },
    ]);
  });

  it("preserves compatibility characters so citations remain exact", () => {
    const source = "Built ﬁnancial dashboards with Ｔａｂｌｅａｕ.";

    expect(buildSourceSegments(source, "resume")).toEqual([
      { id: "resume-1", text: source },
    ]);
  });

  it("materializes exact source excerpts and deterministic graph ids", () => {
    const jdSegments = [
      {
        id: "jd-1",
        text: "Collaborate with business stakeholders to align reporting needs.",
      },
      { id: "jd-2", text: "German C1 is required." },
      { id: "jd-3", text: "Tableau experience is preferred." },
    ];
    const resumeSegments = [
      {
        id: "resume-1",
        text: "Worked with business teams on weekly reports.",
      },
      {
        id: "resume-2",
        text: "Built Tableau dashboards for weekly reporting.",
      },
    ];
    const providerOutput = resumeJDDifferenceProviderOutputSchema.parse({
      missionZh: "通过跨团队协作明确报告需求。",
      coreCapabilities: ["相关方协作", "报告需求分析", "德语沟通"],
      overallSummaryZh: "简历有相邻经历，但岗位语言和德语门槛仍有差距。",
      requirements: [
        {
          jdSegmentId: "jd-1",
          kind: "core",
          comparisonMode: "semantic",
          conceptLabelZh: "相关方协作",
          jdTerms: ["business stakeholders", "reporting needs"],
          importanceReasonZh: "属于岗位核心职责。",
          priority: "critical",
          translationZh: "与业务相关方协作并对齐报告需求。",
          assessment: "partial",
          resumeSegmentId: "resume-1",
          profileFactIds: [factId],
          gapType: "language_misaligned",
          resumeStatusZh: "简历有相邻协作经历，但表达不够完整。",
          problemZh: "没有清楚表达需求对齐动作。",
          reasonZh: "简历证据只覆盖部分职责。",
          improvement: {
            targetSection: "experience",
            targetExperienceZh: "业务报告经历",
            focusAreas: ["action", "stakeholders"],
            synonymousJobLanguage: ["business stakeholders"],
            needsConfirmation: false,
            directionZh: "核对并补充真实的需求确认动作与协作对象。",
          },
        },
        {
          jdSegmentId: "jd-2",
          kind: "gate",
          comparisonMode: "strict",
          conceptLabelZh: "德语等级",
          jdTerms: ["German C1"],
          importanceReasonZh: "明确资格门槛。",
          priority: "critical",
          translationZh: "要求德语 C1。",
          assessment: "missing",
          resumeSegmentId: null,
          profileFactIds: [],
          gapType: "gate",
          resumeStatusZh: "当前材料未找到相关证据",
          problemZh: "当前材料没有德语 C1 证据。",
          reasonZh: "语言等级必须严格判断。",
          improvement: null,
        },
        {
          jdSegmentId: "jd-3",
          kind: "preferred",
          comparisonMode: "strict",
          conceptLabelZh: "Tableau",
          jdTerms: ["Tableau"],
          importanceReasonZh: "JD 明确列为加分项。",
          priority: "minor",
          translationZh: "有 Tableau 经验更佳。",
          assessment: "matched",
          resumeSegmentId: "resume-2",
          profileFactIds: [],
          gapType: null,
          resumeStatusZh: "简历有可回查的相邻证据。",
          problemZh: null,
          reasonZh: "当前简历可以回查相关经历。",
          improvement: null,
        },
      ],
    });

    const output = materializeResumeJDDifferenceOutput(providerOutput, {
      jdSegments,
      resumeSegments,
      confirmedFactIds: new Set([factId]),
    });

    expect(output.jobCore.gates[0]?.originalText).toBe(jdSegments[1]?.text);
    expect(output.jobCore.preferredItems[0]?.originalText).toBe(
      jdSegments[2]?.text,
    );
    expect(output.issues.map(({ id, jdOriginal }) => [id, jdOriginal])).toEqual([
      ["issue-1", jdSegments[0]?.text],
      ["issue-2", jdSegments[1]?.text],
    ]);
    expect(output.matched).toEqual([
      expect.objectContaining({
        id: "matched-1",
        jdOriginal: jdSegments[2]?.text,
        resumeExcerpt: resumeSegments[1]?.text,
      }),
    ]);
    expect(output.directions).toEqual([
      expect.objectContaining({
        id: "direction-1",
        issueId: "issue-1",
        conceptId: "concept-1",
      }),
    ]);
    expect(output.overallDifference.topIssueIds).toEqual(["issue-1"]);
  });

  it("downgrades a strict matched claim when the cited resume lacks the exact term", () => {
    const providerOutput = resumeJDDifferenceProviderOutputSchema.parse({
      missionZh: "维护云端服务。",
      coreCapabilities: ["云平台", "服务开发", "系统运维"],
      overallSummaryZh: "云平台要求需要严格核对。",
      requirements: [
        {
          jdSegmentId: "jd-1",
          kind: "core",
          comparisonMode: "strict",
          conceptLabelZh: "AWS 云平台",
          jdTerms: ["AWS"],
          importanceReasonZh: "岗位明确要求 AWS。",
          priority: "critical",
          translationZh: "需要 AWS 实践经验。",
          assessment: "matched",
          resumeSegmentId: "resume-1",
          profileFactIds: [],
          gapType: null,
          resumeStatusZh: "简历提到云平台经验。",
          problemZh: null,
          reasonZh: "模型声称已经匹配。",
          improvement: null,
        },
      ],
    });

    const output = materializeResumeJDDifferenceOutput(providerOutput, {
      jdSegments: [{ id: "jd-1", text: "Hands-on AWS experience is required." }],
      resumeSegments: [{ id: "resume-1", text: "Deployed services on Azure." }],
      confirmedFactIds: new Set(),
    });

    expect(output.matched).toEqual([]);
    expect(output.issues[0]).toMatchObject({
      type: "missing",
      authenticity: "unsupported",
      resumeExcerpt: "Deployed services on Azure.",
    });
    expect(output.directions[0]).toMatchObject({
      synonymousJobLanguage: [],
      needsConfirmation: true,
      authenticity: "unsupported",
    });
  });

  it("does not turn a missing assessment into supported evidence from an unrelated citation", () => {
    const providerOutput = resumeJDDifferenceProviderOutputSchema.parse({
      missionZh: "开展实验分析。",
      coreCapabilities: ["实验设计", "数据分析", "业务洞察"],
      overallSummaryZh: "简历尚未覆盖实验设计。",
      requirements: [
        {
          jdSegmentId: "jd-1",
          kind: "core",
          comparisonMode: "semantic",
          conceptLabelZh: "A/B testing",
          jdTerms: ["A/B testing"],
          importanceReasonZh: "核心职责。",
          priority: "critical",
          translationZh: "需要 A/B 测试经验。",
          assessment: "missing",
          resumeSegmentId: "resume-1",
          profileFactIds: [],
          gapType: "missing",
          resumeStatusZh: "引用了不相关的报告经历。",
          problemZh: "没有实验设计证据。",
          reasonZh: "当前材料未覆盖。",
          improvement: {
            targetSection: "experience",
            targetExperienceZh: null,
            focusAreas: ["method"],
            synonymousJobLanguage: ["A/B testing"],
            needsConfirmation: false,
            directionZh: "先确认是否做过相关实验。",
          },
        },
      ],
    });

    const output = materializeResumeJDDifferenceOutput(providerOutput, {
      jdSegments: [{ id: "jd-1", text: "Experience with A/B testing." }],
      resumeSegments: [{ id: "resume-1", text: "Prepared weekly reports." }],
      confirmedFactIds: new Set(),
    });

    expect(output.issues[0]?.authenticity).toBe("unsupported");
    expect(output.directions[0]).toMatchObject({
      synonymousJobLanguage: [],
      needsConfirmation: true,
      authenticity: "unsupported",
    });
  });

  it("drops unknown references instead of publishing invented excerpts", () => {
    const providerOutput = resumeJDDifferenceProviderOutputSchema.parse({
      missionZh: "支持业务决策。",
      coreCapabilities: ["分析", "沟通", "报告"],
      overallSummaryZh: "存在待确认差异。",
      requirements: [
        {
          jdSegmentId: "jd-99",
          kind: "core",
          comparisonMode: "semantic",
          conceptLabelZh: "分析",
          jdTerms: ["business data"],
          importanceReasonZh: "核心职责。",
          priority: "critical",
          translationZh: "分析业务数据。",
          assessment: "missing",
          resumeSegmentId: null,
          profileFactIds: [],
          gapType: "missing",
          resumeStatusZh: "当前材料未找到相关证据",
          problemZh: "没有证据。",
          reasonZh: "无法回查。",
          improvement: null,
        },
      ],
    });

    expect(() =>
      materializeResumeJDDifferenceOutput(providerOutput, {
        jdSegments: [{ id: "jd-1", text: "Analyze business data." }],
        resumeSegments: [],
        confirmedFactIds: new Set(),
      }),
    ).toThrow("resume-jd-difference-reference-invalid");
  });
});
