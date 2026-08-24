import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ManualFactForm } from "./manual-fact-form";

describe("ManualFactForm", () => {
  it("shows only language-specific fields and submits a pending-ready normalized fact", async () => {
    const user = userEvent.setup();
    const createFact = vi.fn().mockResolvedValue({ ok: true });
    render(<ManualFactForm createFact={createFact} />);

    await user.click(screen.getByRole("button", { name: "＋ 手动添加事实" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "类型" }), "language");

    expect(screen.getByRole("textbox", { name: "语言" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "熟练程度" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "证书或证明（可选）" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /组织|公司/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /技能（/ })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "语言" }), "德语");
    await user.type(screen.getByRole("textbox", { name: "熟练程度" }), "B2");
    await user.type(screen.getByRole("textbox", { name: "证书或证明（可选）" }), "Goethe B2");
    await user.click(screen.getByRole("button", { name: "保存为待确认" }));

    expect(createFact).toHaveBeenCalledWith({
      factType: "language",
      data: {
        title: "德语",
        organization: null,
        startDate: null,
        endDate: null,
        description: "熟练程度：B2\n证书或证明：Goethe B2",
        skills: [],
      },
    });
  });

  it("shows validation beside the missing category-specific field", async () => {
    const user = userEvent.setup();
    render(<ManualFactForm createFact={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "＋ 手动添加事实" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "类型" }), "language");
    await user.type(screen.getByRole("textbox", { name: "语言" }), "德语");
    await user.click(screen.getByRole("button", { name: "保存为待确认" }));

    expect(screen.getByText("请填写熟练程度")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "熟练程度" })).toHaveAttribute("aria-invalid", "true");
  });
});
