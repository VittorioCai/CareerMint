import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ConfirmedFactForAnalysis } from "@/features/career-profile/confirmed-facts";

import type { ResumeJDDifferenceRun } from "./repository";
import type { ResumeJDDifferenceOutput } from "./schemas";
import { ResumeJDDifferencePanel } from "./difference-panel";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

const applicationId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-08-28T10:00:00.000Z";

const knownFactId = "44444444-4444-4444-8444-444444444444";
const forgottenFactId = "55555555-5555-4555-8555-555555555555";

const facts: ConfirmedFactForAnalysis[] = [
  {
    id: knownFactId,
    factType: "work_experience",
    title: "跨部门业务复盘",
    organization: "Northstar GmbH",
    description: "每季度与销售和运营复盘转化数据，输出改进项。",
    skills: ["SQL"],
    sourceExcerpt: "Ran quarterly reviews with sales and operations.",
  },
];

const result: ResumeJDDifferenceOutput = {
  jobCore: {
    mission: "通过数据和跨团队协作支持业务决策。",
    coreCapabilities: ["业务分析", "数据分析", "相关方协作"],
    concepts: [
      {
        id: "concept-1",
        label: "业务分析",
        originalTerms: ["business analysis"],
        importanceReason: "职责和要求中反复出现。",
        priority: "critical",
      },
    ],
    gates: [],
    preferredItems: [],
  },
  overallDifference: {
    summary: "当前简历有数据经历，但岗位语言、场景和结果证据仍不完整。",
    topIssueIds: ["issue-1", "issue-2", "issue-3"],
  },
  issues: [
    {
      id: "issue-1",
      conceptId: "concept-1",
      jdOriginal: "Translate business needs into reporting requirements.",
      jdTranslation: "将业务需求转化为报告需求。",
      resumeExcerpt: "Worked with business teams on reports.",
      resumeStatus: "存在相邻协作经历。",
      profileFactIds: [knownFactId, forgottenFactId],
      type: "language_misaligned",
      problem: "岗位语言没有对齐。",
      reason: "简历没有明确说明需求转化过程。",
      priority: "critical",
      isGate: false,
      authenticity: "supported",
    },
    {
      id: "issue-2",
      conceptId: "concept-1",
      jdOriginal: "Build dashboards for stakeholders.",
      jdTranslation: "为相关方构建仪表盘。",
      resumeExcerpt: null,
      resumeStatus: "模型不应直接采用的任意状态。",
      profileFactIds: [],
      type: "missing",
      problem: "缺少仪表盘场景。",
      reason: "简历没有可回查证据。",
      priority: "important",
      isGate: false,
      authenticity: "unsupported",
    },
    {
      id: "issue-3",
      conceptId: "concept-1",
      jdOriginal: "Present actionable business insights.",
      jdTranslation: "呈现可执行的业务洞察。",
      resumeExcerpt: "Analyzed weekly user data.",
      resumeStatus: "有分析动作但缺少结果。",
      profileFactIds: [],
      type: "missing_result",
      problem: "没有说明分析如何影响决策。",
      reason: "只有动作，没有结果或使用场景。",
      priority: "important",
      isGate: false,
      authenticity: "supported",
    },
    {
      id: "issue-4",
      conceptId: null,
      jdOriginal: "German C1 is required.",
      jdTranslation: "要求德语 C1。",
      resumeExcerpt: null,
      resumeStatus: "当前材料未找到相关证据",
      profileFactIds: [],
      type: "gate",
      problem: "缺少德语 C1 证明。",
      reason: "语言等级是严格门槛。",
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
      jdTranslation: "分析业务数据。",
      resumeExcerpt: "Analyzed weekly user data.",
      profileFactIds: [knownFactId],
      reason: "简历已有直接的数据分析动作。",
    },
  ],
  directions: [
    {
      id: "direction-1",
      issueId: "issue-1",
      targetSection: "experience",
      targetExperience: "报告协作经历",
      conceptId: "concept-1",
      jdTerms: ["business requirements"],
      focusAreas: ["action", "stakeholders"],
      synonymousJobLanguage: ["business requirements"],
      authenticity: "supported",
      needsConfirmation: false,
      direction: "说明需求如何被确认和转化。",
    },
    {
      id: "direction-2",
      issueId: "issue-2",
      targetSection: "experience",
      targetExperience: null,
      conceptId: "concept-1",
      jdTerms: ["dashboards"],
      focusAreas: ["context"],
      synonymousJobLanguage: [],
      authenticity: "unsupported",
      needsConfirmation: true,
      direction: "先确认是否有真实仪表盘经历。",
    },
    {
      id: "direction-3",
      issueId: "issue-3",
      targetSection: "experience",
      targetExperience: "用户数据分析经历",
      conceptId: "concept-1",
      jdTerms: ["business insights"],
      focusAreas: ["result"],
      synonymousJobLanguage: ["business insights"],
      authenticity: "supported",
      needsConfirmation: false,
      direction: "补充真实的使用方和决策结果。",
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
    outputLocale: "zh-CN" as const,
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
  it("holds the analysis control inside the one sticker, with or without a result", () => {
    const control = <button type="button">重新分析</button>;
    const { container, rerender } = render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={null}
        facts={facts}
        control={control}
      />,
    );

    expect(screen.getByRole("button", { name: "重新分析" })).toBeVisible();
    expect(container.querySelectorAll(".soft-surface")).toHaveLength(1);

    rerender(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
        control={control}
      />,
    );

    // One sticker either way: the conclusion and the control it belongs to are
    // two states of the same object, not two cards.
    const sticker = container.querySelector(".soft-surface")!;
    expect(within(sticker as HTMLElement).getByRole("button", { name: "重新分析" })).toBeVisible();
    expect(within(sticker as HTMLElement).getByTestId("severity-tally")).toBeVisible();
    expect(
      within(sticker as HTMLElement).getByText(
        "当前简历有数据经历，但岗位语言、场景和结果证据仍不完整。",
      ),
    ).toBeVisible();
  });

  it("leads with the conclusion, then the job, then the rows", () => {
    const { container } = render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );
    const text = container.textContent ?? "";
    const order = [
      "当前简历有数据经历",
      "这个岗位真正要什么",
      "逐条差异 · 按严重度排序",
      "下一步：查看完善建议",
    ];
    for (let index = 1; index < order.length; index += 1) {
      expect(text.indexOf(order[index - 1])).toBeLessThan(
        text.indexOf(order[index]),
      );
    }
    expect(screen.getByText(/product-analyst-resume\.pdf/u)).toBeVisible();
    expect(screen.getByRole("link", { name: /查看完善建议/u })).toHaveAttribute(
      "href",
      `/applications/${applicationId}?tab=improvements`,
    );
  });

  it("keeps every issue and every match reachable in the one list", () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );
    // Four issues plus one match, none hidden behind a section or a summary.
    expect(screen.getAllByTestId(/^difference-issue-/u)).toHaveLength(5);
    expect(screen.getByTestId("difference-issue-issue-4")).toBeInTheDocument();
    expect(screen.getByTestId("difference-issue-matched-1")).toBeInTheDocument();
  });

  it("keeps the original beside its Chinese reading on the row itself", async () => {
    const user = userEvent.setup();
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );
    const issue = screen.getByTestId("difference-issue-issue-1");
    const summary = issue.querySelector("summary");
    expect(summary).not.toBeNull();

    // Collapsed, the row already carries both languages — the original is
    // never behind a click.
    expect(within(issue).getByText("将业务需求转化为报告需求。")).toBeVisible();
    // Clamped on the row, in full inside the panel — so it appears twice.
    expect(
      within(issue).getAllByText(/Translate business needs into reporting requirements\./u),
    ).toHaveLength(2);

    await user.click(summary!);
    expect(within(issue).getByText("岗位原文")).toBeVisible();
    expect(within(issue).getByText("简历现状")).toBeVisible();
    expect(within(issue).getByText("问题点")).toBeVisible();
    expect(within(issue).getByText("判断依据")).toBeVisible();
  });

  it("uses safe no-evidence copy and keeps matched content collapsed by default", () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );
    expect(screen.getAllByText("当前材料未找到相关证据").length).toBeGreaterThan(0);
    expect(screen.queryByText("你不具备")).not.toBeInTheDocument();
    // A match is a row like any other now, closed until asked.
    expect(screen.getByTestId("difference-issue-matched-1")).not.toHaveAttribute(
      "open",
    );
  });

  it("names the confirmed facts behind a difference and a match", async () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );

    const issue = screen.getByTestId("difference-issue-issue-1");
    await userEvent.click(issue.querySelector("summary")!);
    expect(within(issue).getByText("档案依据")).toBeVisible();
    expect(within(issue).getByText("跨部门业务复盘")).toBeVisible();
    expect(within(issue).queryByText(forgottenFactId)).not.toBeInTheDocument();

    const matched = screen.getByTestId("difference-issue-matched-1");
    await userEvent.click(matched.querySelector("summary")!);
    expect(within(matched).getByText("档案依据")).toBeVisible();
    expect(within(matched).getByText("跨部门业务复盘")).toBeVisible();
  });

  it("numbers ordinary differences and marks gates and matches instead", async () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );

    // The badge carries the row's identity: a running number for a difference
    // you work through, "!" for something rewriting cannot fix, "✓" for what
    // already lines up.
    const first = screen.getByTestId("difference-issue-issue-1");
    expect(within(first).getByTestId("row-badge")).toHaveTextContent("1");
  });

  it("separates priority from type instead of crowding one chip", async () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );

    const issue = screen.getByTestId("difference-issue-issue-1");
    const chip = within(issue).getByTestId("row-priority");
    expect(chip).toHaveTextContent("关键");
    expect(chip).not.toHaveTextContent("岗位语言未对齐");
    expect(within(issue).getByTestId("row-type")).toHaveTextContent(
      "岗位语言未对齐",
    );
  });

  it("drops the three detail fields the row already shows", async () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );

    const issue = screen.getByTestId("difference-issue-issue-1");
    await userEvent.click(issue.querySelector("summary")!);

    // JD original is already on the row, the Chinese reading IS the row
    // heading, and priority IS the chip — repeating them was the page's
    // biggest source of filler.
    expect(within(issue).queryByText("JD 原文")).not.toBeInTheDocument();
    expect(within(issue).queryByText("中文解释")).not.toBeInTheDocument();
    expect(within(issue).queryByText("优先级")).not.toBeInTheDocument();

    expect(within(issue).getByText("简历现状")).toBeVisible();
    expect(within(issue).getByText("问题点")).toBeVisible();
    expect(within(issue).getByText("判断依据")).toBeVisible();
  });

  it("puts differences, gates and matches in one list ordered by severity", () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );

    const rows = screen.getAllByTestId(/^difference-issue-/u);
    const badges = rows.map((row) =>
      within(row).getByTestId("row-badge").textContent,
    );
    // Numbering runs across the sorted list and skips the two rows that are
    // not part of the sequence: a gate you cannot fix by rewriting, and
    // something that already lines up.
    expect(badges).toEqual(["1", "!", "2", "3", "✓"]);
  });

  it("counts the list once, at the top, instead of per section", () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );

    const tally = screen.getByTestId("severity-tally");
    expect(tally).toHaveTextContent("1关键差异");
    expect(tally).toHaveTextContent("1岗位门槛");
    expect(tally).toHaveTextContent("1已对上");
  });

  it("drops the three section headings the single list replaces", () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );

    expect(screen.queryByText("岗位门槛待确认")).not.toBeInTheDocument();
    expect(screen.queryByText("已经对上的内容")).not.toBeInTheDocument();
    expect(screen.queryByText("岗位核心判断")).not.toBeInTheDocument();
  });

  it("states the job's core as a sentence rather than three empty cells", () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );

    expect(screen.getByText("这个岗位真正要什么")).toBeVisible();
    expect(screen.getByText("通过数据和跨团队协作支持业务决策。")).toBeVisible();
    expect(screen.getByText("业务分析")).toBeVisible();
    // The numbered cells said nothing the sentence above does not.
    expect(screen.queryByText("重点 01")).not.toBeInTheDocument();
  });

  it("stops decorating a Chinese page with English section kickers", () => {
    const { container } = render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );

    for (const kicker of [
      "Job brief",
      "Executive read",
      "Evidence review",
      "Qualification check",
      "Confirmed alignment",
      "Soft workflow",
    ]) {
      expect(container).not.toHaveTextContent(kicker);
    }
  });

  it("does not tell a resume that covers everything to go fix things", () => {
    const covered = succeededRun();
    covered.result = {
      ...result,
      overallDifference: {
        summary: "这份简历已经覆盖了这个岗位提出的每一项要求。",
        topIssueIds: [],
      },
      issues: [],
    };

    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={covered}
        facts={facts}
      />,
    );

    expect(screen.getByText("岗位要求 · 全部已对上")).toBeVisible();
    expect(screen.queryByText("逐条差异 · 按严重度排序")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /进入面试准备/u })).toHaveAttribute(
      "href",
      `/applications/${applicationId}?tab=interview`,
    );
    expect(screen.queryByText(/查看完善建议/u)).not.toBeInTheDocument();
  });

  it("does not call a stale run's file the current baseline", () => {
    const { rerender } = render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );
    expect(screen.getByText("分析已完成")).toBeVisible();

    rerender(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
        stale
        readerLocale="zh-CN"
      />,
    );
    expect(screen.getByText("结果已过期")).toBeVisible();
    expect(screen.queryByText("分析已完成")).not.toBeInTheDocument();
  });

  it("offers a Markdown export for the displayed run and marks previous results", () => {
    const { rerender } = render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
      />,
    );
    expect(screen.getByRole("link", { name: "导出 Markdown" })).toHaveAttribute(
      "href",
      `/api/applications/${applicationId}/resume-jd-difference/export?runId=33333333-3333-4333-8333-333333333333`,
    );

    rerender(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
        stale
      />,
    );
    expect(screen.getByRole("link", { name: "导出 Markdown" })).toHaveAttribute(
      "href",
      expect.stringContaining("&stale=1"),
    );
  });
});

describe("a result written in the other language", () => {
  /**
   * Switching the interface language must not lose the analysis.
   *
   * The language is part of the input hash, so a switch makes the stored run
   * stale — correctly, because its findings are in the other language. What
   * would be wrong is to answer that by showing nothing, or by telling the
   * reader their material changed when only their language did.
   */
  it("says which language the result is in, not that the material changed", () => {
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={{ ...succeededRun(), outputLocale: "en" }}
        facts={facts}
        stale
        readerLocale="zh-CN"
      />,
    );

    // The findings are still on screen.
    expect(screen.getByTestId("severity-tally")).toBeVisible();
    // And they are labelled with their own language, named in itself.
    expect(screen.getByText("English")).toBeVisible();
    expect(screen.getByText(zhCN.difference.otherLanguage)).toBeVisible();
  });

  it("says nothing about language when the result matches the reader", () => {
    // A run stale because the JD or the resume changed is a different thing,
    // and labelling it with a language would be noise on every ordinary rerun.
    render(
      <ResumeJDDifferencePanel
        copy={zhCN.difference}
        applicationId={applicationId}
        run={succeededRun()}
        facts={facts}
        stale
      />,
    );

    expect(screen.getByText(zhCN.difference.stale)).toBeVisible();
    expect(screen.queryByText(zhCN.difference.otherLanguage)).toBeNull();
    expect(screen.queryByText("中文")).toBeNull();
  });
});
