import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ResumeJDDifferenceRun } from "./repository";
import type { ResumeJDDifferenceOutput } from "./schemas";
import { ResumeJDDifferencePanel } from "./difference-panel";

const applicationId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-08-28T10:00:00.000Z";

const result: ResumeJDDifferenceOutput = {
  jobCore: {
    missionZh: "通过数据和跨团队协作支持业务决策。",
    coreCapabilities: ["业务分析", "数据分析", "相关方协作"],
    concepts: [
      {
        id: "concept-1",
        labelZh: "业务分析",
        originalTerms: ["business analysis"],
        importanceReasonZh: "职责和要求中反复出现。",
        priority: "critical",
      },
    ],
    gates: [],
    preferredItems: [],
  },
  overallDifference: {
    summaryZh: "当前简历有数据经历，但岗位语言、场景和结果证据仍不完整。",
    topIssueIds: ["issue-1", "issue-2", "issue-3"],
  },
  issues: [
    {
      id: "issue-1",
      conceptId: "concept-1",
      jdOriginal: "Translate business needs into reporting requirements.",
      jdTranslationZh: "将业务需求转化为报告需求。",
      resumeExcerpt: "Worked with business teams on reports.",
      resumeStatusZh: "存在相邻协作经历。",
      profileFactIds: [],
      type: "language_misaligned",
      problemZh: "岗位语言没有对齐。",
      reasonZh: "简历没有明确说明需求转化过程。",
      priority: "critical",
      isGate: false,
      authenticity: "supported",
    },
    {
      id: "issue-2",
      conceptId: "concept-1",
      jdOriginal: "Build dashboards for stakeholders.",
      jdTranslationZh: "为相关方构建仪表盘。",
      resumeExcerpt: null,
      resumeStatusZh: "模型不应直接采用的任意状态。",
      profileFactIds: [],
      type: "missing",
      problemZh: "缺少仪表盘场景。",
      reasonZh: "简历没有可回查证据。",
      priority: "important",
      isGate: false,
      authenticity: "unsupported",
    },
    {
      id: "issue-3",
      conceptId: "concept-1",
      jdOriginal: "Present actionable business insights.",
      jdTranslationZh: "呈现可执行的业务洞察。",
      resumeExcerpt: "Analyzed weekly user data.",
      resumeStatusZh: "有分析动作但缺少结果。",
      profileFactIds: [],
      type: "missing_result",
      problemZh: "没有说明分析如何影响决策。",
      reasonZh: "只有动作，没有结果或使用场景。",
      priority: "important",
      isGate: false,
      authenticity: "supported",
    },
    {
      id: "issue-4",
      conceptId: null,
      jdOriginal: "German C1 is required.",
      jdTranslationZh: "要求德语 C1。",
      resumeExcerpt: null,
      resumeStatusZh: "当前材料未找到相关证据",
      profileFactIds: [],
      type: "gate",
      problemZh: "缺少德语 C1 证明。",
      reasonZh: "语言等级是严格门槛。",
      priority: "critical",
      isGate: true,
      authenticity: "unsupported",
    },
  ],
  matched: [
    {
      id: "matched-1",
      conceptId: "concept-1",
      jdOriginal: "Analyze business data.",
      jdTranslationZh: "分析业务数据。",
      resumeExcerpt: "Analyzed weekly user data.",
      profileFactIds: [],
      reasonZh: "简历已有直接的数据分析动作。",
    },
  ],
  directions: [
    {
      id: "direction-1",
      issueId: "issue-1",
      targetSection: "experience",
      targetExperienceZh: "报告协作经历",
      conceptId: "concept-1",
      jdTerms: ["business requirements"],
      focusAreas: ["action", "stakeholders"],
      synonymousJobLanguage: ["business requirements"],
      authenticity: "supported",
      needsConfirmation: false,
      directionZh: "说明需求如何被确认和转化。",
    },
    {
      id: "direction-2",
      issueId: "issue-2",
      targetSection: "experience",
      targetExperienceZh: null,
      conceptId: "concept-1",
      jdTerms: ["dashboards"],
      focusAreas: ["context"],
      synonymousJobLanguage: [],
      authenticity: "unsupported",
      needsConfirmation: true,
      directionZh: "先确认是否有真实仪表盘经历。",
    },
    {
      id: "direction-3",
      issueId: "issue-3",
      targetSection: "experience",
      targetExperienceZh: "用户数据分析经历",
      conceptId: "concept-1",
      jdTerms: ["business insights"],
      focusAreas: ["result"],
      synonymousJobLanguage: ["business insights"],
      authenticity: "supported",
      needsConfirmation: false,
      directionZh: "补充真实的使用方和决策结果。",
    },
  ],
};

function succeededRun(): ResumeJDDifferenceRun {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    applicationId,
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sourceAssetId: "22222222-2222-4222-8222-222222222222",
    sourceFilename: "product-analyst-resume.pdf",
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

describe("ResumeJDDifferencePanel", () => {
  it("renders the approved information order and a soft next step", () => {
    const { container } = render(
      <ResumeJDDifferencePanel
        applicationId={applicationId}
        run={succeededRun()}
      />,
    );
    const text = container.textContent ?? "";
    const headings = [
      "本次对照简历",
      "岗位核心判断",
      "这份简历的总体差异",
      "具体差异",
      "岗位门槛待确认",
      "已经对上的内容",
      "下一步：查看完善建议",
    ];
    for (let index = 1; index < headings.length; index += 1) {
      expect(text.indexOf(headings[index - 1])).toBeLessThan(
        text.indexOf(headings[index]),
      );
    }
    expect(screen.getByText("product-analyst-resume.pdf")).toBeVisible();
    expect(screen.getByRole("link", { name: "查看完善建议" })).toHaveAttribute(
      "href",
      `/applications/${applicationId}?tab=improvements`,
    );
  });

  it("shows at most three top issues while keeping every issue accessible", () => {
    render(
      <ResumeJDDifferencePanel
        applicationId={applicationId}
        run={succeededRun()}
      />,
    );
    expect(screen.getAllByTestId("top-difference")).toHaveLength(3);
    expect(screen.getAllByTestId(/^difference-issue-/u)).toHaveLength(3);
    expect(screen.getByTestId("gate-issue-issue-4")).toBeInTheDocument();
  });

  it("shows original and Chinese text together with all diagnostic fields", async () => {
    const user = userEvent.setup();
    render(
      <ResumeJDDifferencePanel
        applicationId={applicationId}
        run={succeededRun()}
      />,
    );
    const issue = screen.getByTestId("difference-issue-issue-1");
    const summary = issue.querySelector("summary");
    expect(summary).not.toBeNull();
    await user.click(summary!);
    expect(within(issue).getByText("JD 原文")).toBeVisible();
    expect(
      within(issue).getAllByText(
        "Translate business needs into reporting requirements.",
      ),
    ).toHaveLength(2);
    expect(within(issue).getByText("中文解释")).toBeVisible();
    expect(within(issue).getByText("简历现状")).toBeVisible();
    expect(within(issue).getByText("问题点")).toBeVisible();
    expect(within(issue).getByText("判断依据")).toBeVisible();
    expect(within(issue).getByText("优先级")).toBeVisible();
  });

  it("uses safe no-evidence copy and keeps matched content collapsed by default", () => {
    render(
      <ResumeJDDifferencePanel
        applicationId={applicationId}
        run={succeededRun()}
      />,
    );
    expect(screen.getAllByText("当前材料未找到相关证据").length).toBeGreaterThan(0);
    expect(screen.queryByText("你不具备")).not.toBeInTheDocument();
    expect(screen.getByTestId("matched-details")).not.toHaveAttribute("open");
  });
});
