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
    ];
    const providerOutput = resumeJDDifferenceProviderOutputSchema.parse({
      missionZh: "通过跨团队协作明确报告需求。",
      coreCapabilities: ["相关方协作", "报告需求分析", "德语沟通"],
      overallSummaryZh: "简历有相邻经历，但岗位语言和德语门槛仍有差距。",
      requirements: [
        {
          jdSegmentId: "jd-1",
          kind: "core",
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
          conceptLabelZh: "Tableau",
          jdTerms: ["Tableau"],
          importanceReasonZh: "JD 明确列为加分项。",
          priority: "minor",
          translationZh: "有 Tableau 经验更佳。",
          assessment: "matched",
          resumeSegmentId: "resume-1",
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
        resumeExcerpt: resumeSegments[0]?.text,
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

  it("drops unknown references instead of publishing invented excerpts", () => {
    const providerOutput = resumeJDDifferenceProviderOutputSchema.parse({
      missionZh: "支持业务决策。",
      coreCapabilities: ["分析", "沟通", "报告"],
      overallSummaryZh: "存在待确认差异。",
      requirements: [
        {
          jdSegmentId: "jd-99",
          kind: "core",
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
