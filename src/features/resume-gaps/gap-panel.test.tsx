import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GapPanel } from "./gap-panel";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

const appId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const fact = {
  id: "33333333-3333-4333-8333-333333333333",
  factType: "skill" as const,
  title: "SQL",
  organization: null,
  description: "Advanced SQL analysis",
  skills: ["SQL"],
  sourceExcerpt: "SQL and funnel analysis",
};

const item = (id: string, coverage: "missing" | "partial" | "covered", evidence: ConfirmedFactForAnalysis[] = [], resumeExcerpt?: string) => ({
  id,
  runId,
  applicationId: appId,
  userId: "44444444-4444-4444-8444-444444444444",
  requirementId: id,
  requirementText: `${coverage} requirement`,
  category: "skill" as const,
  priority: "core" as const,
  jdSourceExcerpt: `JD excerpt for ${coverage}`,
  resumeCoverage: coverage,
  verifiedResumeExcerpt: coverage === "missing" ? (resumeExcerpt ?? null) : `Resume excerpt for ${coverage}`,
  sortOrder: 0,
  createdAt: "2026-08-24T10:00:00.000Z",
  profileEvidence: evidence,
  historical: false,
});

describe("GapPanel", () => {
  it("renders profile-only labels without calling any resume-gap endpoint", () => {
    render(
      <GapPanel
        applicationId={appId}
        baseline={null}
        requirements={[
          { id: "1", text: "Supported", priority: "core", category: "skill", sortOrder: 0, matchStatus: "evidence", evidence: [fact] },
          { id: "2", text: "Partial", priority: "supporting", category: "skill", sortOrder: 1, matchStatus: "partial", evidence: [] },
          { id: "3", text: "Missing", priority: "core", category: "skill", sortOrder: 2, matchStatus: "none", evidence: [] },
          { id: "4", text: "Decision", priority: "core", category: "skill", sortOrder: 3, matchStatus: "needs_user", evidence: [] },
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

  it("shows all four groups, keeps covered collapsed, and reveals evidence in the approved order", async () => {
    const user = userEvent.setup();
    render(
      <GapPanel
        applicationId={appId}
        baseline={{ id: "asset", originalName: "resume.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ id: runId, status: "succeeded", sourceFilename: "resume.pdf", sourceAssetId: "asset", analysisRunId: "analysis" }}
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

  it("warns when displaying a prior succeeded snapshot after the latest run failed", () => {
    render(
      <GapPanel
        applicationId={appId}
        baseline={{ id: "asset", originalName: "current.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ id: "failed", status: "failed", errorCode: "resume-gap-parse-failed", sourceFilename: "current.pdf", sourceAssetId: "asset", analysisRunId: "current-analysis" }}
        fallbackRun={{ id: runId, status: "succeeded", sourceFilename: "older.pdf", sourceAssetId: "old-asset", analysisRunId: "older-analysis" }}
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
        applicationId={appId}
        baseline={{ id: "new-asset", originalName: "new.pdf", contentType: "application/pdf", createdAt: "2026-08-24T10:00:00.000Z" }}
        requirements={[]}
        run={{ id: runId, status: "succeeded", sourceFilename: "old.pdf", sourceAssetId: "old-asset", analysisRunId: "same-analysis" }}
        fallbackRun={{ id: runId, status: "succeeded", sourceFilename: "old.pdf", sourceAssetId: "old-asset", analysisRunId: "same-analysis" }}
        currentAnalysisRunId="same-analysis"
        items={[item("e5555555-5555-4555-8555-555555555555", "covered")]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("上一份简历或上一版 JD");
    expect(screen.getByRole("alert")).toHaveTextContent("old.pdf");
    expect(screen.getByText(/这份简历已覆盖当前 JD 要求/)).toBeVisible();
  });
});
