import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthForm } from "./auth-form";

vi.mock("./actions", () => ({
  login: vi.fn(),
  signup: vi.fn(),
}));

describe("AuthForm callback feedback", () => {
  it("shows the invalid-link message", () => {
    render(<AuthForm callbackError="invalid-link" />);

    expect(
      screen.getByText("验证链接无效或已过期，请重新申请"),
    ).toBeInTheDocument();
  });

  it("shows the session-not-created message", () => {
    render(<AuthForm callbackError="session-not-created" />);

    expect(
      screen.getByText("邮箱可能已完成验证，请使用邮箱和密码登录"),
    ).toBeInTheDocument();
  });

  it("shows login guidance and a return-to-login button for a consumed email link", () => {
    render(<AuthForm callbackError="email-link-used" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "邮箱已完成注册，验证链接可能已使用或已过期。返回登录即可。",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回登录" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("ignores unknown callback statuses", () => {
    render(<AuthForm callbackError={"provider-error" as never} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
