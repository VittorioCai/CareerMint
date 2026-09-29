import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorCopyProvider } from "@/i18n/error-copy";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

import { RouteError } from "./route-error";

describe("RouteError", () => {
  it("speaks the reader's language, shows the digest and retries", async () => {
    const user = userEvent.setup();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });

    render(
      <ErrorCopyProvider
        copy={{ ...zhCN.errorPages, retry: zhCN.common.retry }}
      >
        <RouteError error={error} retry={retry} home="desk" />
      </ErrorCopyProvider>,
    );

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
});
