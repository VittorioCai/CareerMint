import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SetupProgress } from "./setup-progress";

describe("SetupProgress", () => {
  it("shows the agreed resume-first setup order and current step", () => {
    render(<SetupProgress current="resume" />);

    const steps = screen.getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining("JD 已保存"),
      expect.stringContaining("选择并预览简历"),
      expect.stringContaining("分析 JD"),
      expect.stringContaining("查看差距"),
    ]);
    expect(screen.getByText("选择并预览简历").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });
});
