import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GapPanel } from "./gap-panel";

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
    render(
      <GapPanel
        baseline={{ id: "new-asset", originalName: "new.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ status: "succeeded", sourceFilename: "old.pdf", sourceAssetId: "old-asset", analysisRunId: "same-analysis" }}
        fallbackRun={{ status: "succeeded", sourceFilename: "old.pdf", sourceAssetId: "old-asset", analysisRunId: "same-analysis" }}
        currentAnalysisRunId="same-analysis"
        items={[item("e5555555-5555-4555-8555-555555555555", "covered")]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("上一份简历或上一版 JD");
    expect(screen.getByRole("alert")).toHaveTextContent("old.pdf");
    expect(screen.getByText(/旧快照记录的简历覆盖了当时分析的要求/)).toBeVisible();
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
    expect(screen.queryByText("职业档案中也没有已确认事实")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("简历差距摘要")).getAllByText("0")).toHaveLength(4);
  });
});
