import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FactEditor } from "./fact-editor";
import type { CareerFact } from "./schemas";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

const pendingFact: CareerFact = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sourceAssetId: "11111111-1111-4111-8111-111111111111",
  factType: "achievement",
  data: {
    title: "Checkout conversion improvement",
    organization: "Example GmbH",
    startDate: "2025-01",
    endDate: null,
    description: "Improved checkout conversion by 18%.",
    skills: ["SQL"],
  },
  sourceExcerpt: "Improved checkout conversion by 18% through funnel analysis.",
  confirmationStatus: "pending",
  confirmedAt: null,
};

function actions() {
  return {
    confirm: vi.fn().mockResolvedValue({ ok: true }),
    markNeedsDetail: vi.fn().mockResolvedValue({ ok: true }),
    update: vi.fn().mockResolvedValue({ ok: true }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
  };
}

describe("FactEditor", () => {
  it("requires an explicit checkbox in a dialog that repeats the exact fact", async () => {
    const user = userEvent.setup();
    const factActions = actions();
    render(<FactEditor copy={zhCN.profile} common={zhCN.common} fact={pendingFact} actions={factActions} />);

    expect(screen.getByRole("button", { name: "确认真实" })).toBeVisible();
    expect(screen.getByRole("button", { name: "需要补充" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "确认真实" }));

    const dialog = screen.getByRole("dialog", { name: "确认职业事实" });
    expect(dialog).toHaveTextContent("Checkout conversion improvement");
    expect(dialog).toHaveTextContent("Improved checkout conversion by 18%.");
    const submit = screen.getByRole("button", { name: "确认并保存" });
    expect(submit).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", {
        name: "我确认这条内容真实、准确，并同意用于后续求职材料",
      }),
    );
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(factActions.confirm).toHaveBeenCalledWith({
      factId: pendingFact.id,
      explicitConfirmation: true,
    });
  });

  it("keeps a confirmed fact to a row until it is opened", async () => {
    const user = userEvent.setup();
    render(
      <FactEditor copy={zhCN.profile} common={zhCN.common} fact={{
          ...pendingFact,
          confirmationStatus: "confirmed",
          confirmedAt: "2026-08-14T00:00:00.000Z",
        }}
        actions={actions()}
      />,
    );

    // Enough to recognise it by: its state, its title, where and when, and a
    // line of what it says.
    expect(screen.getByText("已确认")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Checkout conversion improvement" }),
    ).toBeVisible();
    expect(screen.getByText("Example GmbH · 2025-01 至今")).toBeVisible();
    const toggle = screen.getByRole("button", {
      name: "展开详情: Checkout conversion improvement",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "编辑事实" })).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName(
      "收起详情: Checkout conversion improvement",
    );
    expect(screen.getByRole("button", { name: "编辑事实" })).toBeVisible();
    // Nothing left to decide, so nothing asks for a decision.
    expect(screen.queryByRole("button", { name: "确认真实" })).toBeNull();
  });

  it("opens a fact that is still waiting for a decision", () => {
    render(<FactEditor copy={zhCN.profile} common={zhCN.common} fact={pendingFact} actions={actions()} />);

    expect(
      screen.getByRole("button", {
        name: "收起详情: Checkout conversion improvement",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "确认真实" })).toBeVisible();
  });

  it("offers deletion from inside the edit form, not beside the title", async () => {
    const user = userEvent.setup();
    render(<FactEditor copy={zhCN.profile} common={zhCN.common} fact={pendingFact} actions={actions()} />);

    expect(screen.queryByRole("button", { name: "删除事实" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "编辑事实" }));
    expect(screen.getByRole("button", { name: "删除事实" })).toBeVisible();
  });

  it("deletes only after the dialog that repeats the fact is confirmed", async () => {
    const user = userEvent.setup();
    const factActions = actions();
    render(<FactEditor copy={zhCN.profile} common={zhCN.common} fact={pendingFact} actions={factActions} />);

    await user.click(screen.getByRole("button", { name: "编辑事实" }));
    await user.click(screen.getByRole("button", { name: "删除事实" }));
    const dialog = screen.getByRole("dialog", { name: "删除这条职业事实？" });
    expect(dialog).toHaveTextContent("Checkout conversion improvement");
    expect(factActions.remove).not.toHaveBeenCalled();

    // The edit form behind the dialog has a cancel of its own.
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(factActions.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "删除事实" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(factActions.remove).toHaveBeenCalledWith({ factId: pendingFact.id });
  });

  it("uses the same category-specific language fields when editing", async () => {
    const user = userEvent.setup();
    render(
      <FactEditor copy={zhCN.profile} common={zhCN.common} fact={{
          ...pendingFact,
          factType: "language",
          data: {
            title: "德语",
            organization: null,
            startDate: null,
            endDate: null,
            description: "熟练程度：B2\n证书或证明：Goethe B2",
            skills: [],
          },
        }}
        actions={actions()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑事实" }));
    expect(screen.getByRole("textbox", { name: "语言" })).toHaveValue("德语");
    expect(screen.getByRole("textbox", { name: "熟练程度" })).toHaveValue("B2");
    expect(screen.getByRole("textbox", { name: "证书或证明（可选）" })).toHaveValue("Goethe B2");
    expect(screen.queryByRole("textbox", { name: /组织|公司/ })).not.toBeInTheDocument();
  });
});
