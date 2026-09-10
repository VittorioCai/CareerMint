import { describe, expect, it } from "vitest";

import {
  resumeJDDifferenceOutputSchema,
  storedResumeJDDifferenceOutputSchema,
  validateResumeJDDifferenceGraph,
  type ResumeJDDifferenceOutput,
} from "./schemas";

const factId = "11111111-1111-4111-8111-111111111111";

function fixture(): ResumeJDDifferenceOutput {
  return {
    jobCore: {
      mission: "通过数据分析支持业务团队做出更好的产品决策。",
      coreCapabilities: ["业务分析", "数据分析", "跨团队协作"],
      concepts: [
        {
          id: "concept-1",
          label: "业务相关方协作",
          originalTerms: ["stakeholder management", "business stakeholders"],
          importanceReason: "职责和要求均反复提到与业务团队协作。",
          priority: "critical",
        },
      ],
      gates: [
        {
          id: "gate-1",
          originalText: "German C1 is required.",
          translation: "要求德语达到 C1。",
          reason: "这是明确的语言等级要求。",
        },
      ],
      preferredItems: [
        {
          id: "preferred-1",
          originalText: "Tableau experience is preferred.",
          translation: "有 Tableau 经验者优先。",
          reason: "JD 将其列为加分项。",
        },
      ],
    },
    overallDifference: {
      summary: "简历有业务沟通经历，但没有使用岗位熟悉的表达，也未说明沟通对象。",
      topIssueIds: ["issue-1"],
    },
    issues: [
      {
        id: "issue-1",
        conceptId: "concept-1",
        jdOriginal: "Collaborate with business stakeholders to align reporting needs.",
        jdTranslation: "与业务相关方协作，对齐报告需求。",
        resumeExcerpt: "Worked with business teams on weekly reports.",
        resumeStatus: "简历提到与业务团队合作，但没有说明需求对齐过程。",
        profileFactIds: [factId],
        type: "language_misaligned",
        problem: "岗位语言未对齐，协作职责表达过弱。",
        reason: "简历证据支持相近职责，但没有呈现 stakeholder management 的具体动作。",
        priority: "critical",
        isGate: false,
        authenticity: "supported",
      },
      {
        id: "issue-2",
        conceptId: null,
        jdOriginal: "German C1 is required.",
        jdTranslation: "要求德语达到 C1。",
        resumeExcerpt: "German B2",
        resumeStatus: "当前简历标注德语 B2。",
        profileFactIds: [],
        type: "gate",
        problem: "当前材料显示的语言等级低于岗位门槛。",
        reason: "语言等级必须严格比较，不能通过调整措辞解决。",
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
        jdTranslation: "准备每周业务报告。",
        resumeExcerpt: "Prepared weekly business reports.",
        profileFactIds: [],
        reason: "简历有直接且可回查的报告经历。",
      },
    ],
    directions: [
      {
        id: "direction-1",
        issueId: "issue-1",
        targetSection: "experience",
        targetExperience: "每周业务报告相关经历",
        conceptId: "concept-1",
        jdTerms: ["stakeholder management", "align reporting needs"],
        focusAreas: ["action", "stakeholders", "context"],
        synonymousJobLanguage: ["business stakeholders", "reporting needs"],
        authenticity: "supported",
        needsConfirmation: false,
        direction: "在已有报告经历中补充与业务方确认需求的真实过程，并对齐岗位使用的协作语言。",
      },
      {
        id: "direction-2",
        issueId: "issue-2",
        targetSection: "languages",
        targetExperience: null,
        conceptId: null,
        jdTerms: ["German C1"],
        focusAreas: [],
        synonymousJobLanguage: [],
        authenticity: "supported",
        needsConfirmation: false,
        direction: "语言等级属于岗位门槛，不能通过调整简历措辞解决。",
      },
    ],
  };
}

describe("resume JD difference V4 output", () => {
  it("accepts one atomic graph used by both tabs", () => {
    const parsed = resumeJDDifferenceOutputSchema.parse(fixture());

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
    candidate.directions[0]!.direction =
      "Collaborated with business stakeholders to align reporting needs and delivered dashboards.";

    expect(validateResumeJDDifferenceGraph(candidate)).toEqual({
      ok: false,
      code: "paste-ready-rewrite-not-allowed",
    });
  });
});

describe("storedResumeJDDifferenceOutputSchema", () => {
  /**
   * A run written before the rename has to keep opening.
   *
   * Not a hypothetical: every analysis in the database uses the old spelling,
   * and the panels that render them read the new names. Without this the
   * repository would return `result: null` for all of them and the pages
   * would silently show "no analysis yet" over rows that hold one.
   */
  const legacy = {
    jobCore: {
      missionZh: "支持业务决策。",
      coreCapabilities: ["分析"],
      concepts: [
        {
          id: "concept-1",
          labelZh: "分析",
          originalTerms: ["analysis"],
          importanceReasonZh: "核心职责。",
          priority: "critical",
        },
      ],
      gates: [
        {
          id: "gate-1",
          originalText: "German C1 required.",
          translationZh: "需要德语 C1。",
          reasonZh: "岗位明确要求。",
        },
      ],
      preferredItems: [],
    },
    overallDifference: { summaryZh: "需要补足业务场景。", topIssueIds: ["issue-1"] },
    issues: [
      {
        id: "issue-1",
        conceptId: "concept-1",
        jdOriginal: "Analyze customer data.",
        jdTranslationZh: "分析客户数据。",
        resumeExcerpt: "Analyzed user data.",
        resumeStatusZh: "有相邻证据。",
        profileFactIds: [],
        type: "missing_context",
        problemZh: "缺少业务场景。",
        reasonZh: "简历未说明分析用途。",
        priority: "critical",
        isGate: false,
        authenticity: "supported",
      },
    ],
    matched: [],
    directions: [
      {
        id: "direction-1",
        issueId: "issue-1",
        targetSection: "experience",
        targetExperienceZh: "数据分析经历",
        conceptId: "concept-1",
        jdTerms: ["customer data"],
        focusAreas: ["context"],
        synonymousJobLanguage: [],
        authenticity: "supported",
        needsConfirmation: false,
        directionZh: "核对真实业务场景。",
      },
    ],
  };

  it("reads a run stored under the old Zh-suffixed names", () => {
    const parsed = storedResumeJDDifferenceOutputSchema.parse(legacy);

    expect(parsed).toMatchObject({
      jobCore: {
        mission: "支持业务决策。",
        concepts: [{ label: "分析", importanceReason: "核心职责。" }],
        gates: [{ translation: "需要德语 C1。", reason: "岗位明确要求。" }],
      },
      overallDifference: { summary: "需要补足业务场景。" },
      issues: [
        {
          jdTranslation: "分析客户数据。",
          resumeStatus: "有相邻证据。",
          problem: "缺少业务场景。",
          reason: "简历未说明分析用途。",
        },
      ],
      directions: [
        { targetExperience: "数据分析经历", direction: "核对真实业务场景。" },
      ],
    });
  });

  it("keeps the current name when a row somehow carries both", () => {
    // Renaming into an occupied key would replace live text with stale text,
    // which is worse than ignoring the legacy copy.
    const parsed = storedResumeJDDifferenceOutputSchema.parse({
      ...legacy,
      overallDifference: {
        summaryZh: "旧文本",
        summary: "新文本",
        topIssueIds: ["issue-1"],
      },
    });

    expect(
      (parsed as { overallDifference: { summary: string } }).overallDifference
        .summary,
    ).toBe("新文本");
  });

  it("still holds a fresh provider response to the current names", () => {
    // The point of a separate stored schema: if the contract itself accepted
    // both spellings, nothing would ever move the model onto one of them.
    expect(
      resumeJDDifferenceOutputSchema.safeParse(legacy).success,
    ).toBe(false);
  });
});
