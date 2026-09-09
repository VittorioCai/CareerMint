import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(cleanup);

/**
 * jsdom has no top layer, so `<dialog>` gets the element but not `showModal`,
 * `show` or `close` (jsdom 30). These stubs give the DOM the open/closed state
 * the component and its tests read, and being spies they also let a test
 * assert that a dialog was opened *modally* — `show()` does not trap focus.
 *
 * They deliberately do not simulate the focus trap. That is browser behaviour,
 * and faking it here would turn a real guarantee into a green tick that proves
 * nothing; `tests/e2e/dialog-focus.spec.ts` presses Tab in a real Chromium.
 */
// Node-environment specs share this file and have no DOM at all.
if (
  typeof HTMLDialogElement !== "undefined" &&
  !HTMLDialogElement.prototype.showModal
) {
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.show = vi.fn(function show(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(
    this: HTMLDialogElement,
  ) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
}
