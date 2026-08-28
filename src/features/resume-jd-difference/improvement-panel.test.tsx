import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ResumeJDDifferenceRun } from "./repository";
import type { ResumeJDDifferenceOutput } from "./schemas";
import {
  ResumeJDImprovementPanel,
  improvementGroupForIssue,
} from "./improvement-panel";

const applicationId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-08-28T10:00:00.000Z";

const issueBase = {
  conceptId: "concept-1",
  jdOriginal: "Work with business stakeholders.",
  jdTranslationZh: "与业务相关方协作。",
  resumeExcerpt: "Worked with business teams.",
  resumeStatusZh: "存在相邻经历。",
  profileFactIds: [] as string[],
  problemZh: "当前表达不完整。",
  reasonZh: "需要补充真实语境。",
  priority: "important" as const,
  isGate: false,
  authenticity: "supported" as const,
};

const result: ResumeJDDifferenceOutput = {
  jobCore: {
    missionZh: "通过业务分析支持决策。",
    coreCapabilities: ["业务分析", "数据分析", "协作"],
    concepts: [
      {
        id: "concept-1",
        labelZh: "业务分析",
        originalTerms: ["business analysis"],
        importanceReasonZh: "核心职责。",
        priority: "critical",
      },
    ],
    gates: [],
    preferredItems: [],
  },
  overallDifference: {
    summaryZh: "需要改善表达和证据。",
    topIssueIds: ["issue-1"],
  },
  issues: [
    { ...issueBase, id: "issue-1", type: "language_misaligned" },
    { ...issueBase, id: "issue-2", type: "missing_result" },
    { ...issueBase, id: "issue-3", type: "skill_only" },
    {
      ...issueBase,
      id: "issue-4",
      resumeExcerpt: null,
      resumeStatusZh: "当前材料未找到相关证据",
      type: "missing",
      authenticity: "unsupported",
    },
    {
      ...issueBase,
      id: "issue-5",
      conceptId: null,
      jdOriginal: "German C1 is required.",
      jdTranslationZh: "要求德语 C1。",
      resumeExcerpt: null,
      resumeStatusZh: "当前材料未找到相关证据",
      type: "gate",
      isGate: true,
      authenticity: "unsupported",
    },
  ],
  matched: [],
  directions: [
    {
      id: "direction-1",
      issueId: "issue-1",
      targetSection: "experience",
      targetExperienceZh: "业务报告经历",
      conceptId: "concept-1",
      jdTerms: ["stakeholder management"],
      focusAreas: ["action", "stakeholders", "context"],
      synonymousJobLanguage: ["business stakeholders", "reporting needs"],
      authenticity: "supported",
      needsConfirmation: false,
      directionZh: "核对真实协作对象和需求确认场景。",
    },
    {
      id: "direction-2",
      issueId: "issue-2",
      targetSection: "experience",
      targetExperienceZh: "数据分析经历",
      conceptId: "concept-1",
      jdTerms: ["business insights"],
      focusAreas: ["result"],
      synonymousJobLanguage: ["business insights"],
      authenticity: "supported",
      needsConfirmation: false,
      directionZh: "核对分析结论被谁使用以及产生的真实影响。",
    },
    {
      id: "direction-3",
      issueId: "issue-3",
      targetSection: "experience",
      targetExperienceZh: "SQL 项目",
      conceptId: "concept-1",
      jdTerms: ["SQL"],
      focusAreas: ["placement", "method"],
      synonymousJobLanguage: ["SQL analysis"],
      authenticity: "supported",
      needsConfirmation: false,
      directionZh: "把已确认的工具放回真实使用场景，而不是只留在技能区。",
    },
    {
      id: "direction-4",
      issueId: "issue-4",
      targetSection: "experience",
      targetExperienceZh: null,
      conceptId: "concept-1",
      jdTerms: ["dashboard"],
      focusAreas: ["context", "result"],
      synonymousJobLanguage: [],
      authenticity: "unsupported",
      needsConfirmation: true,
      directionZh: "先确认是否存在真实经历，再决定是否补充。",
    },
  ],
};

function run(): ResumeJDDifferenceRun {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    applicationId,
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sourceAssetId: "22222222-2222-4222-8222-222222222222",
    sourceFilename: "resume.pdf",
    sourceSha256: "a".repeat(64),
    jdSha256: "b".repeat(64),
    factFingerprint: "c".repeat(64),
    inputHash: "d".repeat(64),
    provider: "deepseek",
    model: "deepseek-v4-flash",
    schemaVersion: "resume-jd-difference-v4",
    promptVersion: "resume-jd-difference-p1-v4.0",
    policyVersion: "resume-jd-difference-policy-v4.0",
    status: "succeeded",
    attemptCount: 1,
    result,
    aiUsage: {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: null,
      usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 1, outputTokens: 1 },
      priceScheduleVersion: null,
    },
    estimatedCostUsd: null,
    errorCode: null,
    errorMessage: null,
    startedAt: timestamp,
    completedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("ResumeJDImprovementPanel", () => {
  it("uses the five approved groups for issue types", () => {
    expect(improvementGroupForIssue("language_misaligned")).toBe("岗位语言未对齐");
    expect(improvementGroupForIssue("missing_result")).toBe("经历证据需要加强");
    expect(improvementGroupForIssue("skill_only")).toBe("关键词位置较弱");
    expect(improvementGroupForIssue("missing")).toBe("需要本人确认");
    expect(improvementGroupForIssue("gate")).toBe("不能通过改简历解决");
  });

  it("renders every group and links each direction back to a diagnosed issue", () => {
    render(
      <ResumeJDImprovementPanel
        applicationId={applicationId}
        run={run()}
        freshness="current"
      />,
    );
    for (const heading of [
      "岗位语言未对齐",
      "经历证据需要加强",
      "关键词位置较弱",
      "需要本人确认",
      "不能通过改简历解决",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    }
    expect(screen.getAllByTestId(/^improvement-item-/u)).toHaveLength(5);
  });

  it("shows target, focus, job language, authenticity, and the grounded direction", () => {
    render(
      <ResumeJDImprovementPanel
        applicationId={applicationId}
        run={run()}
        freshness="current"
      />,
    );
    const item = screen.getByTestId("improvement-item-issue-1");
    expect(within(item).getByText("目标位置")).toBeVisible();
    expect(within(item).getByText("工作经历 · 业务报告经历")).toBeVisible();
    expect(within(item).getByText("完善重点")).toBeVisible();
    expect(within(item).getByText(/动作 · 协作对象 · 场景/u)).toBeVisible();
    expect(within(item).getByText("岗位原词 / 同义表达")).toBeVisible();
    expect(within(item).getByText(/business stakeholders/u)).toBeVisible();
    expect(within(item).getByText("真实性")).toBeVisible();
    expect(within(item).getByText("当前简历有可回查证据")).toBeVisible();
    expect(within(item).getByText("核对真实协作对象和需求确认场景。")).toBeVisible();
  });

  it("warns unsupported users not to add unverified content and never offers rewriting actions", () => {
    const { container } = render(
      <ResumeJDImprovementPanel
        applicationId={applicationId}
        run={run()}
        freshness="current"
      />,
    );
    const unsupported = screen.getByTestId("improvement-item-issue-4");
    expect(within(unsupported).getByText(/如未实际做过，请不要加入简历/u)).toBeVisible();
    expect(within(unsupported).queryByText("dashboard")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("接受");
    expect(container).not.toHaveTextContent("拒绝");
    expect(container).not.toHaveTextContent("自动修改");
    expect(container).not.toHaveTextContent("基础版本");
  });

  it("shows only a prerequisite message when analysis is missing or stale", () => {
    const { rerender } = render(
      <ResumeJDImprovementPanel
        applicationId={applicationId}
        run={null}
        freshness="missing"
      />,
    );
    expect(screen.getByText("请先完成差异分析")).toBeVisible();
    expect(screen.getByRole("link", { name: "前往差异分析" })).toHaveAttribute(
      "href",
      `/applications/${applicationId}?tab=difference`,
    );

    rerender(
      <ResumeJDImprovementPanel
        applicationId={applicationId}
        run={run()}
        freshness="stale"
      />,
    );
    expect(screen.getByText("材料已变化，请重新分析")).toBeVisible();
    expect(screen.queryByTestId(/^improvement-item-/u)).not.toBeInTheDocument();
  });

  it("ends with the optional next step to interview preparation", () => {
    render(
      <ResumeJDImprovementPanel
        applicationId={applicationId}
        run={run()}
        freshness="current"
      />,
    );
    expect(screen.getByRole("link", { name: "进入面试准备" })).toHaveAttribute(
      "href",
      `/applications/${applicationId}?tab=interview`,
    );
  });
});
