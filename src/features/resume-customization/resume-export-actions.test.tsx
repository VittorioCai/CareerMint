// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResumeExportActions } from "./resume-export-actions";

describe("ResumeExportActions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("downloads a successful export and confirms it without leaving the page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Uint8Array.from([80, 75, 3, 4]), {
        headers: {
          "content-disposition": 'attachment; filename="acme-role-v2.docx"',
        },
      }),
    );
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:resume");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <ResumeExportActions
        applicationId="application-id"
        versionId="version-id"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "下载 DOCX" }));

    await screen.findByText("DOCX 下载已开始。");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it("shows the DOCX fallback when PDF cannot encode the resume", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: "pdf-unsupported-characters", fallback: "docx" },
        { status: 400 },
      ),
    );
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:resume");

    render(
      <ResumeExportActions
        applicationId="application-id"
        versionId="version-id"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "下载 PDF" }));

    await screen.findByText("PDF 暂不支持其中的文字，请下载 DOCX。");
    expect(createObjectURL).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "下载 PDF" })).toBeEnabled(),
    );
  });
});
