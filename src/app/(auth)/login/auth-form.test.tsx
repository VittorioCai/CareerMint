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

  it("ignores unknown callback statuses", () => {
    render(<AuthForm callbackError={"provider-error" as never} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
