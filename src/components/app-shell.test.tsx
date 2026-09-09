import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

import { AppShellView } from "./app-shell-view";

vi.mock("@/app/(app)/actions", () => ({
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/applications",
}));

// The language switch reaches for a Server Function, which reaches for the
// Supabase server client. Rendering the shell does not call it.
vi.mock("@/i18n/actions", () => ({
  setInterfaceLocaleAction: vi.fn(),
}));

// AppShell itself resolves the request's language and is server-only; the
// markup it hands off is what a component test can render.
function shell(dictionary = en) {
  return render(
    <AppShellView locale="en" dictionary={dictionary}>
      <p>Application content</p>
    </AppShellView>,
  );
}

describe("AppShell", () => {
  it("keeps creating an application reachable without making it a destination", () => {
    shell();

    const create = screen.getByRole("link", { name: en.shell.newApplication });
    expect(create).toHaveAttribute("href", "/applications/new");

    // It used to sit at the head of the mobile navigation, reading as a fifth
    // place alongside 首页 and 我的投递. It is a verb, not a place: it belongs
    // beside the account menu, and the tab bar is only the four destinations.
    for (const navigation of screen.getAllByRole("navigation", {
      name: en.shell.primaryNavigation,
    })) {
      expect(navigation).not.toContainElement(create);
      expect(within(navigation).getAllByRole("link")).toHaveLength(4);
    }
  });

  it("labels the navigation itself rather than the sidebar around it", () => {
    shell();

    // A sidebar holding the primary navigation is not a complementary region.
    // Labelling the <aside> 主导航 announced it as one, and left the <nav>
    // inside it nameless.
    for (const navigation of screen.getAllByRole("navigation", {
      name: en.shell.primaryNavigation,
    })) {
      expect(navigation.tagName).toBe("NAV");
    }
    expect(
      screen.queryByRole("complementary", { name: en.shell.primaryNavigation }),
    ).toBeNull();
  });

  it("renders in whichever language it is handed", () => {
    shell(zhCN);

    expect(
      screen.getByRole("link", { name: zhCN.shell.newApplication }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("navigation", { name: zhCN.shell.primaryNavigation }),
    ).not.toHaveLength(0);
    // The two languages must not be able to collide on a label — if they did,
    // every assertion above would pass in either language and prove nothing.
    expect(zhCN.shell.newApplication).not.toBe(en.shell.newApplication);
  });
});
