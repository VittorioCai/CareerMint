import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SetupProgress } from "./setup-progress";

describe("SetupProgress", () => {
  it("shows the agreed resume-first setup order and current step", () => {
    render(<SetupProgress current="resume" />);

    const steps = screen.getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining("保存 JD"),
      expect.stringContaining("选择并预览简历"),
      expect.stringContaining("分析 JD"),
      expect.stringContaining("查看差距"),
    ]);
    expect(screen.getByText("选择并预览简历").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("gives the new-application page the same steps as the workspace", async () => {
    // The new-application page hard-coded its own five-step list — 添加 JD,
    // 解析要求, 匹配档案, 补充资料, 建立工作区 — that never advanced past step one
    // and used labels appearing nowhere else. A user finished it and was
    // immediately shown a different four-step vocabulary.
    const source = await readFile(
      join(process.cwd(), "src/app/(app)/applications/new/page.tsx"),
      "utf8",
    );
    expect(source).toContain("SetupProgress");
    for (const invented of ["解析要求", "匹配档案", "补充资料"]) {
      expect(source).not.toContain(invented);
    }
  });
});
