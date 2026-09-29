import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { zhCN } from "@/i18n/dictionaries/zh-CN";

import { ResumeWorkspace, getResumeWorkspaceMode } from "./resume-workspace";

describe("resume workspace", () => {
  it("keeps the no-baseline and ready modes explicit", () => {
    expect(getResumeWorkspaceMode({ selectedAssetId: null })).toBe("no-baseline");
    expect(getResumeWorkspaceMode({ selectedAssetId: "asset" })).toBe("ready");
  });

  it("asks for a baseline before pointing at the difference analysis", () => {
    render(<ResumeWorkspace copy={zhCN.resume} applicationId="app" mode="no-baseline" baselineSelector={<div>baseline selector</div>} />);

    expect(screen.getByRole("heading", { name: "对照简历" })).toBeVisible();
    expect(screen.getByText("baseline selector")).toBeVisible();
    // No link on to the analysis: with nothing to compare, all that page can
    // do is send the reader back here.
    expect(screen.queryByRole("link", { name: /前往差异分析/ })).toBeNull();
    expect(
      screen.getByText("对照简历确定后，系统才能判断它与岗位要求之间的差异。"),
    ).toBeVisible();
  });

  it("links straight to the difference analysis once a baseline is chosen", () => {
    render(<ResumeWorkspace copy={zhCN.resume} applicationId="app" mode="ready" baselineSelector={<div>baseline selector</div>} />);

    expect(screen.getByRole("link", { name: /前往差异分析/ })).toHaveAttribute(
      "href",
      "/applications/app?tab=difference",
    );
  });

  it("no longer offers resume versions or a legacy gap snapshot", () => {
    render(<ResumeWorkspace copy={zhCN.resume} applicationId="app" mode="ready" baselineSelector={<div>baseline selector</div>} />);

    expect(screen.queryByText(/历史版本|旧版简历差距|查看版本|不可变快照/)).not.toBeInTheDocument();
  });
});
