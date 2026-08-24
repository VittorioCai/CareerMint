import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

vi.mock("@/app/(app)/actions", () => ({
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/applications",
}));

describe("AppShell", () => {
  it("keeps the mobile create-application entry in the navigation flow", () => {
    render(
      <AppShell>
        <p>Application content</p>
      </AppShell>,
    );

    const mobileNavigation = screen.getByRole("navigation", {
      name: "移动端主导航",
    });
    const createLink = screen.getByRole("link", { name: "移动端新建申请" });

    expect(mobileNavigation).toContainElement(createLink);
    expect(mobileNavigation.querySelector("a")).toBe(createLink);
    expect(createLink).not.toHaveClass("fixed");
    expect(createLink).toHaveAttribute("href", "/applications/new");
  });
});
