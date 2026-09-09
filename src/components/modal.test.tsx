import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./modal";

/**
 * jsdom does not implement the top layer, so what these can check is that the
 * component drives the native element correctly: opening calls `showModal`
 * (not `show`, which does not trap focus), closing calls `close`, and Escape
 * reaches `onClose`. That the trap actually holds is a browser behaviour, and
 * it is proven where browsers exist — `tests/e2e/dialog-focus.spec.ts`.
 */
describe("Modal", () => {
  it("opens as a modal, not as a plain popover", () => {
    render(
      <Modal open label="确认删除账户" onClose={vi.fn()}>
        <p>内容</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "确认删除账户" });
    expect(dialog).toBeVisible();
    // `show()` leaves the rest of the page reachable by Tab; only `showModal()`
    // makes the browser trap focus and mark everything else inert.
    expect((dialog as HTMLDialogElement).showModal).toHaveBeenCalled();
    expect((dialog as HTMLDialogElement).show).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    render(
      <Modal open={false} label="确认删除账户" onClose={vi.fn()}>
        <p>内容</p>
      </Modal>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("内容")).toBeNull();
  });

  it("closes the element when the caller closes it", () => {
    const { rerender } = render(
      <Modal open label="确认删除账户" onClose={vi.fn()}>
        <p>内容</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");

    rerender(
      <Modal open={false} label="确认删除账户" onClose={vi.fn()}>
        <p>内容</p>
      </Modal>,
    );

    expect((dialog as HTMLDialogElement).close).toHaveBeenCalled();
  });

  it("reports a cancel to the caller rather than closing behind its back", () => {
    const onClose = vi.fn();
    render(
      <Modal open label="确认删除账户" onClose={onClose}>
        <button type="button">取消</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");

    // jsdom does not turn Escape into a `cancel` event, so the key press is
    // the browser's half of this and is checked in the e2e. What belongs here
    // is that the handler is wired at all, and that it defers to the caller:
    // `open` is the caller's, and an element that closed itself would be
    // reopened by the next render.
    const cancelled = dialog.dispatchEvent(
      new Event("cancel", { cancelable: true }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancelled).toBe(false);
  });

  it("does not swallow keys the content needs", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open label="确认删除账户" onClose={onClose}>
        <input aria-label="确认文字" />
      </Modal>,
    );

    await user.click(screen.getByLabelText("确认文字"));
    await user.keyboard("DELETE");

    expect(screen.getByLabelText("确认文字")).toHaveValue("DELETE");
    expect(onClose).not.toHaveBeenCalled();
  });
});
