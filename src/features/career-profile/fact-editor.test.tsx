import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FactEditor } from "./fact-editor";
import type { CareerFact } from "./schemas";

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
    render(<FactEditor fact={pendingFact} actions={factActions} />);

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

  it("shows confirmed status while retaining edit and delete controls", () => {
    render(
      <FactEditor
        fact={{
          ...pendingFact,
          confirmationStatus: "confirmed",
          confirmedAt: "2026-08-14T00:00:00.000Z",
        }}
        actions={actions()}
      />,
    );

    expect(screen.getByText("已确认")).toBeVisible();
    expect(screen.getByRole("button", { name: "编辑事实" })).toBeVisible();
    expect(screen.getByRole("button", { name: "删除事实" })).toBeVisible();
  });
});
