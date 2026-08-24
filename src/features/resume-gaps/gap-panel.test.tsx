import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GapPanel, summaryCellClass } from "./gap-panel";
import { markItemsHistoricalUnlessCurrent } from "./resume-workspace";

type GapFactFixture = { id: string; title: string; description: string; sourceExcerpt: string | null };

const fact = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "SQL",
  description: "Advanced SQL analysis",
  sourceExcerpt: "SQL and funnel analysis",
};

const item = (id: string, coverage: "missing" | "partial" | "covered", evidence: GapFactFixture[] = [], resumeExcerpt?: string) => ({
  id,
  requirementText: `${coverage} requirement`,
  priority: "core" as const,
  jdSourceExcerpt: `JD excerpt for ${coverage}`,
  resumeCoverage: coverage,
  verifiedResumeExcerpt: coverage === "missing" ? (resumeExcerpt ?? null) : `Resume excerpt for ${coverage}`,
  profileEvidence: evidence,
  historical: false,
});

describe("GapPanel", () => {
  it("keeps summary separators aligned for mobile two-column and desktop four-column grids", () => {
    expect(summaryCellClass(0)).not.toMatch(/border-l/);
    expect(summaryCellClass(1)).toMatch(/border-l/);
    expect(summaryCellClass(1)).not.toMatch(/border-t/);
    expect(summaryCellClass(2)).toMatch(/border-t/);
    expect(summaryCellClass(2).split(" ")).not.toContain("border-l");
    expect(summaryCellClass(2)).toMatch(/sm:border-l/);
    expect(summaryCellClass(3)).toMatch(/border-l/);
    expect(summaryCellClass(3)).toMatch(/border-t/);
    expect(summaryCellClass(3)).toMatch(/sm:border-l/);
  });

  it("renders profile-only labels without calling any resume-gap endpoint", () => {
    render(
      <GapPanel
        baseline={null}
        requirements={[
          { id: "1", text: "Supported", priority: "core", matchStatus: "evidence", evidence: [fact] },
          { id: "2", text: "Partial", priority: "supporting", matchStatus: "partial", evidence: [] },
          { id: "3", text: "Missing", priority: "core", matchStatus: "none", evidence: [] },
          { id: "4", text: "Decision", priority: "core", matchStatus: "needs_user", evidence: [] },
        ]}
        run={null}
        fallbackRun={null}
        items={[]}
      />,
    );
    expect(screen.getByText("仅职业档案模式")).toBeVisible();
    const profileSummary = within(screen.getByLabelText("职业档案摘要"));
    expect(profileSummary.getByText("档案已支持")).toBeVisible();
    expect(profileSummary.getByText("部分匹配")).toBeVisible();
    expect(profileSummary.getByText("缺少证据")).toBeVisible();
    expect(profileSummary.getByText("需要判断")).toBeVisible();
    expect(screen.queryByText("简历漏写")).not.toBeInTheDocument();
  });

  it("links confirmed profile facts and labels manually confirmed sources", async () => {
    const user = userEvent.setup();
    render(
      <GapPanel
        baseline={null}
        requirements={[{ id: "manual", text: "Manual fact", priority: "core", matchStatus: "evidence", evidence: [{ ...fact, sourceExcerpt: null }] }]}
        run={null}
        fallbackRun={null}
        items={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Manual fact/ }));
    expect(screen.getByRole("link", { name: "查看职业档案" })).toHaveAttribute("href", "/profile");
    expect(screen.getByText(/来源：用户手动确认/)).toBeVisible();
  });

  it("shows fact title, description, and a distinct original source without repeating identical text", async () => {
    const user = userEvent.setup();
    render(
      <GapPanel
        baseline={null}
        requirements={[{
          id: "structured-fact",
          text: "Structured fact",
          priority: "core",
          matchStatus: "evidence",
          evidence: [{
            ...fact,
            description: "Built reliable reporting dashboards.",
            sourceExcerpt: "Built reliable reporting dashboards.",
          }],
        }]}
        run={null}
        fallbackRun={null}
        items={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Structured fact/ }));

    expect(screen.getByText("SQL", { exact: true })).toBeVisible();
    expect(screen.getAllByText("Built reliable reporting dashboards.", { exact: true })).toHaveLength(1);
    expect(screen.queryByText(/原始来源：Built reliable reporting dashboards\./)).not.toBeInTheDocument();
  });

  it("shows all four groups, keeps covered collapsed, and reveals evidence in the approved order", async () => {
    const user = userEvent.setup();
    render(
      <GapPanel
        baseline={{ id: "asset", originalName: "resume.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ status: "succeeded", sourceFilename: "resume.pdf", sourceAssetId: "asset", analysisRunId: "analysis" }}
        fallbackRun={null}
        currentAnalysisRunId="analysis"
        items={[item("a1111111-1111-4111-8111-111111111111", "missing", [fact]), item("b2222222-2222-4222-8222-222222222222", "partial", [fact]), item("c3333333-3333-4333-8333-333333333333", "missing"), item("d4444444-4444-4444-8444-444444444444", "covered")]}
      />,
    );
    const gapSummary = within(screen.getByLabelText("简历差距摘要"));
    expect(gapSummary.getByText("简历漏写")).toBeVisible();
    expect(gapSummary.getByText("部分覆盖")).toBeVisible();
    expect(gapSummary.getByText("缺少证据")).toBeVisible();
    expect(gapSummary.getByText("已经覆盖")).toBeVisible();
    expect(screen.getByRole("button", { name: /已经覆盖/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("JD excerpt for covered")).not.toBeInTheDocument();

    const row = screen.getByRole("button", { name: /partial requirement/ });
    await user.click(row);
    const jd = screen.getByText("JD excerpt for partial");
    const resume = screen.getByText("Resume excerpt for partial");
    const profile = screen.getByText(/Advanced SQL analysis/);
    const explanation = screen.getByText(/当前简历仅部分覆盖/);
    expect(jd.compareDocumentPosition(resume) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resume.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(profile.compareDocumentPosition(explanation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps an explicit empty profile-evidence section in expanded partial and covered rows", async () => {
    const user = userEvent.setup();
    render(
      <GapPanel
        baseline={{ id: "asset", originalName: "resume.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ status: "succeeded", sourceFilename: "resume.pdf", sourceAssetId: "asset", analysisRunId: "analysis" }}
        fallbackRun={null}
        currentAnalysisRunId="analysis"
        items={[item("partial-empty", "partial"), item("covered-empty", "covered")]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /partial requirement/ }));
    expect(screen.getByText("暂无已确认职业事实。" )).toBeVisible();
    expect(screen.getByRole("link", { name: "查看职业档案" })).toHaveAttribute("href", "/profile");
    const coveredSummary = screen.getAllByText("已经覆盖").find((element) => element.closest("summary"));
    await user.click(coveredSummary!.closest("summary")!);
    await user.click(screen.getByRole("button", { name: /covered requirement/ }));
    expect(screen.getAllByText("暂无已确认职业事实。" )).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "查看职业档案" })).toHaveLength(2);
  });

  it("shows needs-user guidance beside a current gap status", () => {
    render(
      <GapPanel
        baseline={{ id: "asset", originalName: "resume.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ status: "succeeded", sourceFilename: "resume.pdf", sourceAssetId: "asset", analysisRunId: "analysis" }}
        fallbackRun={null}
        currentAnalysisRunId="analysis"
        items={[{ ...item("needs-user", "partial"), matchStatus: "needs_user" }]}
      />,
    );
    expect(screen.getByRole("button", { name: /partial requirement/ })).toHaveTextContent("需要用户判断");
  });

  it("warns when displaying a prior succeeded snapshot after the latest run failed", () => {
    render(
      <GapPanel
        baseline={{ id: "asset", originalName: "current.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ status: "failed", sourceFilename: "current.pdf", sourceAssetId: "asset", analysisRunId: "current-analysis" }}
        fallbackRun={{ status: "succeeded", sourceFilename: "older.pdf", sourceAssetId: "old-asset", analysisRunId: "older-analysis" }}
        currentAnalysisRunId="current-analysis"
        items={[item("e5555555-5555-4555-8555-555555555555", "covered")]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("上一份简历或上一版 JD");
    expect(screen.getByRole("alert")).toHaveTextContent("older.pdf");
    expect(screen.getByText("只读旧快照")).toBeVisible();
  });

  it("marks a succeeded result for a previous baseline as stale instead of current", () => {
    const run = { status: "succeeded" as const, sourceFilename: "old.pdf", sourceAssetId: "old-asset", analysisRunId: "same-analysis" };
    render(
      <GapPanel
        baseline={{ id: "new-asset", originalName: "new.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={run}
        fallbackRun={run}
        currentAnalysisRunId="same-analysis"
        items={markItemsHistoricalUnlessCurrent(
          [item("e5555555-5555-4555-8555-555555555555", "covered")],
          run,
          "new-asset",
          "same-analysis",
        )}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("上一份简历或上一版 JD");
    expect(screen.getByRole("alert")).toHaveTextContent("old.pdf");
    expect(screen.getByText("历史快照 1 项")).toBeVisible();
    expect(screen.queryByLabelText("简历差距摘要")).not.toBeInTheDocument();
    expect(screen.queryByText(/旧快照记录的简历覆盖了当时分析的要求/)).not.toBeInTheDocument();
  });

  it("does not claim current coverage when covered current items are mixed with historical missing items", async () => {
    const user = userEvent.setup();
    render(
      <GapPanel
        baseline={{ id: "asset", originalName: "current.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ status: "succeeded", sourceFilename: "current.pdf", sourceAssetId: "asset", analysisRunId: "analysis" }}
        fallbackRun={null}
        currentAnalysisRunId="analysis"
        items={[item("current-covered", "covered"), { ...item("historical-missing", "missing"), historical: true }]}
      />,
    );
    expect(screen.queryByText(/这份简历已覆盖当前 JD 要求/)).not.toBeInTheDocument();
    await user.click(screen.getByText(/历史差距快照/));
    expect(screen.getByText(/未覆盖（旧快照）/)).toBeVisible();
  });

  it("shows only the historical snapshot area when no current items exist", () => {
    render(
      <GapPanel
        baseline={{ id: "asset", originalName: "current.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ status: "succeeded", sourceFilename: "old.pdf", sourceAssetId: "old-asset", analysisRunId: "old-analysis" }}
        fallbackRun={null}
        currentAnalysisRunId="current-analysis"
        items={[{ ...item("historical-missing-only", "missing"), historical: true }]}
      />,
    );
    expect(screen.getByText("历史快照 1 项")).toBeVisible();
    expect(screen.queryByLabelText("简历差距摘要")).not.toBeInTheDocument();
    expect(screen.getByText(/历史差距快照/)).toBeVisible();
  });

  it("does not show a current retry error for a failed run from an old baseline", () => {
    render(
      <GapPanel
        baseline={{ id: "new-asset", originalName: "new.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ status: "failed", sourceFilename: "old.pdf", sourceAssetId: "old-asset", analysisRunId: "old-analysis" }}
        fallbackRun={null}
        currentAnalysisRunId="current-analysis"
        items={[]}
      />,
    );
    expect(screen.queryByText("上一次分析失败，请重试。")).not.toBeInTheDocument();
    expect(screen.getByText("等待分析")).toBeVisible();
  });

  it("wraps long requirement and evidence text for narrow screens", async () => {
    const user = userEvent.setup();
    const longText = "An extremely-long-requirement-url.example.com/with-a-very-long-path-and-no-spaces";
    const longJd = `${longText}/jd`;
    const longResume = `${longText}/resume`;
    render(
      <GapPanel
        baseline={{ id: "asset", originalName: "resume.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ status: "succeeded", sourceFilename: "resume.pdf", sourceAssetId: "asset", analysisRunId: "analysis" }}
        fallbackRun={null}
        currentAnalysisRunId="analysis"
        items={[{ ...item("long", "partial"), requirementText: longText, jdSourceExcerpt: longJd, verifiedResumeExcerpt: longResume }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: new RegExp(longText) }));
    expect(within(screen.getByRole("button", { name: new RegExp(longText) })).getByText(longText).className).toMatch(/break-words/);
    expect(screen.getByText(longJd).className).toMatch(/whitespace-pre-wrap/);
  });

  it("keeps historical missing coverage outside current groups and does not invent absent profile evidence", async () => {
    const user = userEvent.setup();
    render(
      <GapPanel
        baseline={{ id: "new-asset", originalName: "new.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ status: "succeeded", sourceFilename: "old.pdf", sourceAssetId: "old-asset", analysisRunId: "old-analysis" }}
        fallbackRun={null}
        currentAnalysisRunId="new-analysis"
        items={[{ ...item("e6666666-6666-4666-8666-666666666666", "missing"), historical: true }]}
      />,
    );
    await user.click(screen.getByText(/历史差距快照/));
    await user.click(screen.getByRole("button", { name: /未覆盖（旧快照）/ }));
    expect(screen.getByText("未覆盖（旧快照）")).toBeVisible();
    expect(screen.getByText(/原职业档案证据无法从历史快照重建/)).toBeVisible();
    expect(screen.queryByText(/旧快照记录的简历覆盖了当时分析的要求/)).not.toBeInTheDocument();
    expect(screen.queryByText("职业档案中也没有已确认事实")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("简历差距摘要")).not.toBeInTheDocument();
  });
});
