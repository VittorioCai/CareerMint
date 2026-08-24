import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResumeWorkspace, getResumeWorkspaceMode, isCurrentGapRun, markItemsHistoricalUnlessCurrent, selectGapRunPair } from "./resume-workspace";

describe("resume workspace", () => {
  it("keeps no-JD, profile-only, and comparison modes explicit", () => {
    expect(getResumeWorkspaceMode({ analysisRunId: null, selectedAssetId: "asset" })).toBe("no-jd");
    expect(getResumeWorkspaceMode({ analysisRunId: "jd", selectedAssetId: null })).toBe("profile-only");
    expect(getResumeWorkspaceMode({ analysisRunId: "jd", selectedAssetId: "asset" })).toBe("comparison");
  });

  it("renders the resume-gap heading and no-JD link without an analysis control", () => {
    render(<ResumeWorkspace applicationId="app" mode="no-jd" baselineSelector={<div>baseline selector</div>} versions={[]} />);
    expect(screen.getByRole("heading", { name: "简历差距" })).toBeVisible();
    expect(screen.getByRole("link", { name: /返回 JD 分析/ })).toHaveAttribute("href", "/applications/app?tab=jd");
    expect(screen.queryByRole("button", { name: /分析简历差距/ })).not.toBeInTheDocument();
    expect(screen.getByText("baseline selector")).toBeVisible();
  });

  it("renders profile-only with its panel but no analysis control", () => {
    render(
      <ResumeWorkspace
        applicationId="app"
        mode="profile-only"
        baselineSelector={<div>baseline selector</div>}
        gapControl={<button type="button">分析简历差距</button>}
        gapPanel={<section aria-label="profile panel">仅职业档案模式</section>}
        versions={[]}
      />,
    );
    expect(screen.getByRole("region", { name: "profile panel" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "分析简历差距" })).not.toBeInTheDocument();
  });

  it("renders comparison control and panel, and keeps history collapsed with stable deep links", () => {
    render(
      <ResumeWorkspace
        applicationId="app"
        mode="comparison"
        baselineSelector={<div>baseline selector</div>}
        gapControl={<button type="button">分析简历差距</button>}
        gapPanel={<section aria-label="gap panel">简历差距结果</section>}
        versions={[{ id: "v1", versionNumber: 2, template: "modern", itemCount: 3, createdAt: "2026-08-24T00:00:00.000Z" }]}
      />,
    );
    expect(screen.getByRole("button", { name: "分析简历差距" })).toBeVisible();
    expect(screen.getByRole("region", { name: "gap panel" })).toBeVisible();
    const history = screen.getByText(/历史版本/).closest("details");
    expect(history).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: /查看版本/ })).toHaveAttribute("href", "/applications/app/resume/v1");
    expect(screen.queryByText(/继续审核建议|新版本|三栏|改写简历|接受|拒绝/)).not.toBeInTheDocument();
  });

  it("treats a succeeded run for an old baseline as stale", () => {
    const run = { sourceAssetId: "old-asset", analysisRunId: "jd" };
    expect(isCurrentGapRun(run, "new-asset", "jd")).toBe(false);
    expect(isCurrentGapRun(run, "old-asset", "jd")).toBe(true);
  });

  it("marks generic old-baseline items historical even when the JD is unchanged", () => {
    const items = markItemsHistoricalUnlessCurrent(
      [{ id: "item", historical: false }],
      { sourceAssetId: "old-asset", analysisRunId: "jd" },
      "new-asset",
      "jd",
    );

    expect(items).toEqual([{ id: "item", historical: true }]);
  });

  it.each([
    ["B failed", { status: "failed" as const, id: "b" }, { status: "succeeded" as const, id: "b" }],
    ["B succeeded", { status: "succeeded" as const, id: "b" }, { status: "succeeded" as const, id: "b" }],
  ])("prefers exact A/J results when switching back from %s", (_label, latest, fallback) => {
    const exact = { status: "succeeded" as const, id: "a" };
    expect(selectGapRunPair(exact, null, latest, fallback)).toEqual({ latest: exact, fallback: null });
  });
});
