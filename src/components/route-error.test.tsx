import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The frame around a root-level error holds the language switch, which
// reaches for a Server Function.
vi.mock("@/i18n/actions", () => ({
  setInterfaceLocaleAction: vi.fn(),
}));

import { ErrorCopyProvider } from "@/i18n/error-copy";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

import { RouteError } from "./route-error";
import { standaloneFrameCopy } from "./standalone-frame";

const copy = {
  ...zhCN.errorPages,
  retry: zhCN.common.retry,
  frame: standaloneFrameCopy("zh-CN", zhCN),
};

describe("RouteError", () => {
  it("speaks the reader's language, shows the digest and retries", async () => {
    const user = userEvent.setup();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });

    render(
      <ErrorCopyProvider copy={copy}>
        <RouteError error={error} retry={retry} home="desk" />
      </ErrorCopyProvider>,
    );
    // Inside the shell, which already has a header.
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("这个页面暂时无法显示");
    expect(alert).toHaveTextContent("参考编号：abc123");
    // The message can carry anything the code that threw put in it.
    expect(alert).not.toHaveTextContent("boom");
    expect(screen.getByRole("link", { name: "返回工作台" })).toHaveAttribute(
      "href",
      "/app",
    );

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it("brings its own header when nothing is left standing around it", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorCopyProvider copy={copy}>
        <RouteError error={new Error("boom")} retry={vi.fn()} home="site" />
      </ErrorCopyProvider>,
    );

    expect(
      screen.getByRole("link", { name: zhCN.auth.backToHome }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("group", { name: zhCN.common.language }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    logged.mockRestore();
  });
});
