import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const linkStatus = vi.hoisted(() => ({ pending: false }));

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useLinkStatus: () => linkStatus,
}));

import { LinkPending } from "./link-pending";

describe("LinkPending", () => {
  it("occupies its space whether or not a navigation is in flight", () => {
    // Every route in this app is server-rendered on demand and none has a
    // `loading.tsx`, so a click can sit for a moment with nothing on screen.
    // The hint answers that — but it is inside a layout with a zero-shift
    // budget in CI, so it cannot appear and disappear. It is always rendered
    // at a fixed size and only its opacity moves.
    const { container, rerender } = render(<LinkPending />);
    const idle = container.firstElementChild!;

    expect(idle).toHaveClass("link-pending");
    expect(idle).not.toHaveClass("is-pending");
    expect(idle.getAttribute("aria-hidden")).toBe("true");

    linkStatus.pending = true;
    rerender(<LinkPending />);

    expect(container.firstElementChild).toHaveClass("is-pending");
    // Same element, same box: nothing was added to or removed from the flow.
    expect(container.childElementCount).toBe(1);
  });

  it("says nothing to a screen reader", () => {
    // A pending navigation is already announced by the page that arrives.
    // A second, wordless announcement would just interrupt.
    linkStatus.pending = true;
    render(<LinkPending />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
