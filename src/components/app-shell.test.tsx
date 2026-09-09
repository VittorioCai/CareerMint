import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

vi.mock("@/app/(app)/actions", () => ({
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/applications",
}));

describe("AppShell", () => {
  it("keeps creating an application reachable without making it a destination", () => {
    render(
      <AppShell>
        <p>Application content</p>
      </AppShell>,
    );

    const create = screen.getByRole("link", { name: "新建申请" });
    expect(create).toHaveAttribute("href", "/applications/new");

    // It used to sit at the head of the mobile navigation, reading as a fifth
    // place alongside 首页 and 我的投递. It is a verb, not a place: it belongs
    // beside the account menu, and the tab bar is only the four destinations.
    for (const navigation of screen.getAllByRole("navigation", {
      name: "主导航",
    })) {
      expect(navigation).not.toContainElement(create);
      expect(within(navigation).getAllByRole("link")).toHaveLength(4);
    }
  });

  it("labels the navigation itself rather than the sidebar around it", () => {
    render(
      <AppShell>
        <p>Application content</p>
      </AppShell>,
    );

    // A sidebar holding the primary navigation is not a complementary region.
    // Labelling the <aside> 主导航 announced it as one, and left the <nav>
    // inside it nameless.
    for (const navigation of screen.getAllByRole("navigation", {
      name: "主导航",
    })) {
      expect(navigation.tagName).toBe("NAV");
    }
    expect(
      screen.queryByRole("complementary", { name: "主导航" }),
    ).toBeNull();
  });
});
