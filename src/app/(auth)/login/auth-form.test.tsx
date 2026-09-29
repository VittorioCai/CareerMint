import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

import { AuthForm } from "./auth-form";

vi.mock("./actions", () => ({
  login: vi.fn(),
  signup: vi.fn(),
}));

// The messages come from the dictionary rather than being repeated here: a
// test that hardcodes the copy asserts that somebody typed the same sentence
// twice, and goes red on a wording change that broke nothing.
describe("AuthForm callback feedback", () => {
  it("shows the invalid-link message", () => {
    render(<AuthForm callbackError="invalid-link" auth={en.auth} />);

    expect(screen.getByText(en.auth.callback.invalidLink)).toBeInTheDocument();
  });

  it("shows the session-not-created message", () => {
    render(<AuthForm callbackError="session-not-created" auth={en.auth} />);

    expect(
      screen.getByText(en.auth.callback.sessionNotCreated),
    ).toBeInTheDocument();
  });

  it("shows login guidance and a return-to-login button for a consumed email link", () => {
    render(<AuthForm callbackError="email-link-used" auth={en.auth} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      en.auth.callback.emailLinkUsed,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.auth.backToSignIn }),
    ).toHaveAttribute("href", "/login");
  });

  it("ignores unknown callback statuses", () => {
    render(<AuthForm callbackError={"provider-error" as never} auth={en.auth} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says the same thing in Chinese", () => {
    render(<AuthForm callbackError="invalid-link" auth={zhCN.auth} />);

    expect(screen.getByText(zhCN.auth.callback.invalidLink)).toBeInTheDocument();
    // If the two dictionaries agreed on a string, every assertion above would
    // pass in either language and prove nothing about which one rendered.
    expect(zhCN.auth.callback.invalidLink).not.toBe(en.auth.callback.invalidLink);
  });
});

describe("AuthForm modes", () => {
  it("signs in by default, and points a newcomer at the other form", () => {
    render(<AuthForm auth={zhCN.auth} />);

    expect(screen.getByRole("button", { name: zhCN.auth.signIn })).toBeVisible();
    // One job per form: there is no second submit button to press by mistake.
    expect(screen.queryByRole("button", { name: zhCN.auth.signUp })).toBeNull();
    expect(
      screen.getByRole("link", { name: zhCN.auth.signUp }),
    ).toHaveAttribute("href", "/login?mode=signup");
    expect(screen.getByLabelText(zhCN.auth.password)).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    // The rule is for choosing a password, not for typing one that exists.
    expect(screen.queryByText(zhCN.auth.passwordRule)).toBeNull();
  });

  it("states the password rule beside the field when creating an account", () => {
    render(<AuthForm auth={zhCN.auth} mode="signUp" />);

    expect(screen.getByRole("button", { name: zhCN.auth.signUp })).toBeVisible();
    expect(screen.queryByRole("button", { name: zhCN.auth.signIn })).toBeNull();
    expect(
      screen.getByRole("link", { name: zhCN.auth.signIn }),
    ).toHaveAttribute("href", "/login");

    const password = screen.getByLabelText(zhCN.auth.password);
    expect(password).toHaveAttribute("autocomplete", "new-password");
    // Under the field and tied to it, where it is still there once typing
    // has started. It used to be the placeholder.
    expect(password).toHaveAccessibleDescription(zhCN.auth.passwordRule);
    expect(password).not.toHaveAttribute("placeholder");
    expect(
      screen.queryByRole("link", { name: zhCN.auth.forgotPassword }),
    ).toBeNull();
  });
});
