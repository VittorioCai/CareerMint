import { describe, expect, it } from "vitest";

import {
  resumeJDDifferenceOutputSchema,
  validateResumeJDDifferenceGraph,
  type ResumeJDDifferenceOutput,
} from "./schemas";

const factId = "11111111-1111-4111-8111-111111111111";

function fixture(): ResumeJDDifferenceOutput {
  return {
    jobCore: {
      missionZh: "通过数据分析支持业务团队做出更好的产品决策。",
      coreCapabilities: ["业务分析", "数据分析", "跨团队协作"],
      concepts: [
        {
          id: "concept-1",
          labelZh: "业务相关方协作",
          originalTerms: ["stakeholder management", "business stakeholders"],
          importanceReasonZh: "职责和要求均反复提到与业务团队协作。",
          priority: "critical",
        },
      ],
      gates: [
        {
          id: "gate-1",
          originalText: "German C1 is required.",
          translationZh: "要求德语达到 C1。",
          reasonZh: "这是明确的语言等级要求。",
        },
      ],
      preferredItems: [
        {
          id: "preferred-1",
          originalText: "Tableau experience is preferred.",
          translationZh: "有 Tableau 经验者优先。",
          reasonZh: "JD 将其列为加分项。",
        },
      ],
    },
    overallDifference: {
      summaryZh: "简历有业务沟通经历，但没有使用岗位熟悉的表达，也未说明沟通对象。",
      topIssueIds: ["issue-1"],
    },
    issues: [
      {
        id: "issue-1",
        conceptId: "concept-1",
        jdOriginal: "Collaborate with business stakeholders to align reporting needs.",
        jdTranslationZh: "与业务相关方协作，对齐报告需求。",
        resumeExcerpt: "Worked with business teams on weekly reports.",
        resumeStatusZh: "简历提到与业务团队合作，但没有说明需求对齐过程。",
        profileFactIds: [factId],
        type: "language_misaligned",
        problemZh: "岗位语言未对齐，协作职责表达过弱。",
        reasonZh: "简历证据支持相近职责，但没有呈现 stakeholder management 的具体动作。",
        priority: "critical",
        isGate: false,
        authenticity: "supported",
      },
      {
        id: "issue-2",
        conceptId: null,
        jdOriginal: "German C1 is required.",
        jdTranslationZh: "要求德语达到 C1。",
        resumeExcerpt: "German B2",
        resumeStatusZh: "当前简历标注德语 B2。",
        profileFactIds: [],
        type: "gate",
        problemZh: "当前材料显示的语言等级低于岗位门槛。",
        reasonZh: "语言等级必须严格比较，不能通过调整措辞解决。",
        priority: "critical",
        isGate: true,
        authenticity: "supported",
      },
    ],
    matched: [
      {
        id: "matched-1",
        conceptId: "concept-1",
        jdOriginal: "Prepare weekly business reports.",
        jdTranslationZh: "准备每周业务报告。",
        resumeExcerpt: "Prepared weekly business reports.",
        profileFactIds: [],
        reasonZh: "简历有直接且可回查的报告经历。",
      },
    ],
    directions: [
      {
        id: "direction-1",
        issueId: "issue-1",
        targetSection: "experience",
        targetExperienceZh: "每周业务报告相关经历",
        conceptId: "concept-1",
        jdTerms: ["stakeholder management", "align reporting needs"],
        focusAreas: ["action", "stakeholders", "context"],
        synonymousJobLanguage: ["business stakeholders", "reporting needs"],
        authenticity: "supported",
        needsConfirmation: false,
        directionZh: "在已有报告经历中补充与业务方确认需求的真实过程，并对齐岗位使用的协作语言。",
      },
      {
        id: "direction-2",
        issueId: "issue-2",
        targetSection: "languages",
        targetExperienceZh: null,
        conceptId: null,
        jdTerms: ["German C1"],
        focusAreas: [],
        synonymousJobLanguage: [],
        authenticity: "supported",
        needsConfirmation: false,
        directionZh: "语言等级属于岗位门槛，不能通过调整简历措辞解决。",
      },
    ],
  };
}

describe("resume JD difference V4 output", () => {
  it("accepts one atomic graph used by both tabs", () => {
    const parsed = resumeJDDifferenceOutputSchema.parse(fixture());

    expect(validateResumeJDDifferenceGraph(parsed)).toEqual({ ok: true });
  });

  it("accepts a fully matched result with no artificial difference", () => {
    const candidate = fixture();
    candidate.issues = [];
    candidate.directions = [];
    candidate.overallDifference.topIssueIds = [];

    const parsed = resumeJDDifferenceOutputSchema.parse(candidate);

    expect(validateResumeJDDifferenceGraph(parsed)).toEqual({ ok: true });
  });

  it("rejects unknown output keys", () => {
    expect(() =>
      resumeJDDifferenceOutputSchema.parse({
        ...fixture(),
        rewrittenResume: "not allowed",
      }),
    ).toThrow();
  });

  it("rejects more than five core capabilities", () => {
    const candidate = fixture();
    candidate.jobCore.coreCapabilities.push("SQL", "数据可视化", "实验分析");

    expect(() => resumeJDDifferenceOutputSchema.parse(candidate)).toThrow();
  });

  it("rejects a direction linked to an unknown issue", () => {
    const candidate = fixture();
    candidate.directions[0]!.issueId = "issue-99";

    expect(validateResumeJDDifferenceGraph(candidate)).toEqual({
      ok: false,
      code: "direction-issue-not-found",
    });
  });

  it("rejects an issue linked to an unknown concept", () => {
    const candidate = fixture();
    candidate.issues[0]!.conceptId = "concept-99";

    expect(validateResumeJDDifferenceGraph(candidate)).toEqual({
      ok: false,
      code: "issue-concept-not-found",
    });
  });

  it("rejects duplicate identifiers", () => {
    const candidate = fixture();
    candidate.issues[1]!.id = "issue-1";

    expect(validateResumeJDDifferenceGraph(candidate)).toEqual({
      ok: false,
      code: "duplicate-id",
    });
  });

  it("requires gate issues to be marked as gates", () => {
    const candidate = fixture();
    candidate.issues[1]!.isGate = false;

    expect(validateResumeJDDifferenceGraph(candidate)).toEqual({
      ok: false,
      code: "gate-flag-invalid",
    });
  });

  it("rejects safe language suggestions for unsupported evidence", () => {
    const candidate = fixture();
    candidate.directions[0]!.authenticity = "unsupported";

    expect(validateResumeJDDifferenceGraph(candidate)).toEqual({
      ok: false,
      code: "unsupported-language-suggestion-not-allowed",
    });
  });

  it("rejects paste-ready rewritten resume sentences", () => {
    const candidate = fixture();
    candidate.directions[0]!.directionZh =
      "Collaborated with business stakeholders to align reporting needs and delivered dashboards.";

    expect(validateResumeJDDifferenceGraph(candidate)).toEqual({
      ok: false,
      code: "paste-ready-rewrite-not-allowed",
    });
  });
});
