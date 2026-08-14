import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationDraftForm } from "./application-draft-form";

const storageKey = "careermint:new-application-draft:v1";
const completeJd =
  "Lead product discovery, partner with engineering, and measure customer outcomes.";

describe("ApplicationDraftForm", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("restores and saves a browser draft without calling the server", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        companyName: "Saved Company",
        roleTitle: "Product Manager",
        location: "Berlin",
        workplaceMode: "hybrid",
        source: "Company site",
        jobUrl: "",
        jdText: completeJd,
      }),
    );
    const createApplication = vi.fn();
    const user = userEvent.setup();

    render(
      <ApplicationDraftForm createApplication={createApplication} />,
    );

    expect(screen.getByLabelText("公司")).toHaveValue("Saved Company");
    expect(screen.getByLabelText("职位")).toHaveValue("Product Manager");

    await user.clear(screen.getByLabelText("公司"));
    await user.type(screen.getByLabelText("公司"), "Updated Company");

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")).toMatchObject({
        companyName: "Updated Company",
      }),
    );
    expect(screen.getByText("草稿已保存在当前浏览器")).toBeVisible();
    expect(createApplication).not.toHaveBeenCalled();
  });

  it("clears the draft and navigates only after successful creation", async () => {
    const createApplication = vi.fn().mockResolvedValue({
      ok: true,
      applicationId: "11111111-1111-4111-8111-111111111111",
    });
    const navigate = vi.fn();
    const user = userEvent.setup();

    render(
      <ApplicationDraftForm
        createApplication={createApplication}
        navigate={navigate}
      />,
    );

    await user.type(screen.getByLabelText("公司"), "Acme GmbH");
    await user.type(screen.getByLabelText("职位"), "Product Manager");
    await user.selectOptions(screen.getByLabelText("办公方式"), "hybrid");
    await user.type(screen.getByLabelText("JD 原文"), completeJd);
    await user.click(
      screen.getByRole("button", { name: "建立申请工作区" }),
    );

    await waitFor(() => expect(createApplication).toHaveBeenCalledOnce());
    const submitted = createApplication.mock.calls[0][0] as FormData;
    expect(submitted.get("companyName")).toBe("Acme GmbH");
    expect(submitted.get("jdText")).toBe(completeJd);
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(navigate).toHaveBeenCalledWith(
      "/applications/11111111-1111-4111-8111-111111111111",
    );
  });

  it("keeps the local draft and shows a recoverable server error", async () => {
    const createApplication = vi.fn().mockResolvedValue({
      ok: false,
      error: "application-storage-error",
    });
    const user = userEvent.setup();

    render(
      <ApplicationDraftForm createApplication={createApplication} />,
    );

    await user.type(screen.getByLabelText("公司"), "Acme GmbH");
    await user.type(screen.getByLabelText("职位"), "Product Manager");
    await user.type(screen.getByLabelText("JD 原文"), completeJd);
    await user.click(
      screen.getByRole("button", { name: "建立申请工作区" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "暂时无法建立申请工作区",
    );
    expect(window.localStorage.getItem(storageKey)).not.toBeNull();
  });
});
