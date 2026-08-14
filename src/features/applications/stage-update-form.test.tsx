import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StageUpdateForm } from "./stage-update-form";

const applicationId = "11111111-1111-4111-8111-111111111111";

describe("StageUpdateForm", () => {
  it("requires a new text-labelled stage and an occurrence date", () => {
    render(
      <StageUpdateForm
        applicationId={applicationId}
        currentStage="preparing"
        changeStage={vi.fn()}
      />,
    );

    const stage = screen.getByLabelText("新阶段");
    expect(stage).not.toContainHTML('value="preparing"');
    expect(screen.getByRole("option", { name: "已投递" })).toBeVisible();
    expect(screen.getByLabelText("发生日期")).toHaveValue(
      new Date().toISOString().slice(0, 10),
    );
    expect(screen.getByLabelText("备注（可选）")).toBeVisible();
  });

  it("submits once, stays disabled while pending, and refreshes after success", async () => {
    let resolveAction:
      | ((value: { ok: true; applicationId: string }) => void)
      | undefined;
    const changeStage = vi.fn(
      (_formData: FormData) =>
        new Promise<{ ok: true; applicationId: string }>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const refresh = vi.fn();
    const user = userEvent.setup();
    render(
      <StageUpdateForm
        applicationId={applicationId}
        currentStage="preparing"
        changeStage={changeStage}
        refresh={refresh}
      />,
    );

    await user.selectOptions(screen.getByLabelText("新阶段"), "applied");
    await user.type(
      screen.getByLabelText("备注（可选）"),
      "Submitted on company site",
    );
    await user.click(screen.getByRole("button", { name: "确认更新阶段" }));

    expect(screen.getByRole("button", { name: "正在更新…" })).toBeDisabled();
    const submitted = changeStage.mock.calls[0][0];
    expect(submitted.get("applicationId")).toBe(applicationId);
    expect(submitted.get("stage")).toBe("applied");
    expect(submitted.get("note")).toBe("Submitted on company site");

    resolveAction?.({ ok: true, applicationId });
    expect(await screen.findByText("阶段已更新，时间线已记录。")).toBeVisible();
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("keeps the form visible when the server rejects an unchanged stage", async () => {
    const user = userEvent.setup();
    render(
      <StageUpdateForm
        applicationId={applicationId}
        currentStage="applied"
        changeStage={vi.fn().mockResolvedValue({
          ok: false,
          error: "application-stage-unchanged",
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText("新阶段"), "hr");
    await user.click(screen.getByRole("button", { name: "确认更新阶段" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "当前已经是这个阶段",
    );
    expect(screen.getByRole("button", { name: "确认更新阶段" })).toBeEnabled();
  });
});
