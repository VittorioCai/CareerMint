import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ApplicationDeleteControl } from "./application-delete-control";

describe("ApplicationDeleteControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses an inline two-step warning and can be cancelled", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(
      <ApplicationDeleteControl
        applicationId="11111111-1111-4111-8111-111111111111"
        companyName="Acme"
        roleTitle="Product Lead"
        deleteApplication={action}
      />,
    );

    await user.click(screen.getByRole("button", { name: "删除记录" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Acme · Product Lead");
    expect(screen.getByRole("alert")).toHaveTextContent("不会删除职业档案或已上传简历");
    expect(action).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("submits explicit confirmation and reports repository failures accessibly", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({
      ok: false,
      error: "application-not-found",
    });
    render(
      <ApplicationDeleteControl
        applicationId="11111111-1111-4111-8111-111111111111"
        companyName="Acme"
        roleTitle="Product Lead"
        deleteApplication={action}
      />,
    );

    await user.click(screen.getByRole("button", { name: "删除记录" }));
    await user.click(screen.getByRole("button", { name: "确认删除记录" }));

    const formData = action.mock.calls[0][0] as FormData;
    expect(formData.get("confirmed")).toBe("true");
    expect(await screen.findByRole("alert")).toHaveTextContent("记录不存在或已被删除");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
