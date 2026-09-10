import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

import { AuthShellView } from "./auth-shell-view";

vi.mock("@/i18n/actions", () => ({
  setInterfaceLocaleAction: vi.fn(),
}));

function shell(locale: "en" | "zh-CN" = "en") {
  return render(
    <AuthShellView
      locale={locale}
      dictionary={locale === "en" ? en : zhCN}
      eyebrow="Eyebrow"
      title="Title"
      description="Description"
    >
      <p>Form</p>
    </AuthShellView>,
  );
}

describe("AuthShell", () => {
  it("offers the language switch before anyone has an account", () => {
    shell("en");

    // Until this existed, a Chinese speaker landing on the English default had
    // no way to change it: the only switch lived in the account menu, behind a
    // sign-in they were reading an English page to complete.
    const group = screen.getByRole("group", { name: en.common.language });
    expect(
      within(group).getByRole("button", { name: "中文" }),
    ).toBeEnabled();
    expect(within(group).getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows which language is current", () => {
    shell("zh-CN");

    const group = screen.getByRole("group", { name: zhCN.common.language });
    expect(within(group).getByRole("button", { name: "中文" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(group).getByRole("button", { name: "English" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("names each language in itself, never translated", () => {
    // A reader looking for their own language finds it by recognising the
    // word. "Chinese" is no use to someone who cannot read the page it is on.
    for (const locale of ["en", "zh-CN"] as const) {
      shell(locale).unmount();
    }
    shell("en");
    expect(screen.getByRole("button", { name: "中文" })).toBeVisible();
    expect(screen.getByRole("button", { name: "English" })).toBeVisible();
  });
});
