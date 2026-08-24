import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResumeWorkspace, getResumeWorkspaceMode, isCurrentGapRun } from "./resume-workspace";

describe("resume workspace", () => {
  it("keeps no-JD, profile-only, and comparison modes explicit", () => {
    expect(getResumeWorkspaceMode({ analysisRunId: null, selectedAssetId: "asset" })).toBe("no-jd");
    expect(getResumeWorkspaceMode({ analysisRunId: "jd", selectedAssetId: null })).toBe("profile-only");
    expect(getResumeWorkspaceMode({ analysisRunId: "jd", selectedAssetId: "asset" })).toBe("comparison");
  });

  it("renders the resume-gap heading and no-JD link without an analysis control", () => {
    render(<ResumeWorkspace applicationId="app" mode="no-jd" />);
    expect(screen.getByRole("heading", { name: "简历差距" })).toBeVisible();
    expect(screen.getByRole("link", { name: /返回 JD 分析/ })).toHaveAttribute("href", "/applications/app?tab=jd");
    expect(screen.queryByRole("button", { name: /分析简历差距/ })).not.toBeInTheDocument();
  });

  it("treats a succeeded run for an old baseline as stale", () => {
    const run = { sourceAssetId: "old-asset", analysisRunId: "jd" };
    expect(isCurrentGapRun(run, "new-asset", "jd")).toBe(false);
    expect(isCurrentGapRun(run, "old-asset", "jd")).toBe(true);
  });
});
