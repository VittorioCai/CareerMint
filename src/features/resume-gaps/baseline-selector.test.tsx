import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = {
  replace: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { BaselineSelector, type ResumeAssetOption } from "./baseline-selector";

const applicationId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const newerAssetId = "33333333-3333-4333-8333-333333333333";
const assets: ResumeAssetOption[] = [
  {
    id: newerAssetId,
    originalName: "newer-resume.pdf",
    contentType: "application/pdf",
    createdAt: "2026-08-24T10:00:00.000Z",
  },
  {
    id: assetId,
    originalName: "older-resume.docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    createdAt: "2026-08-23T10:00:00.000Z",
  },
];

function actionResult() {
  return { ok: true as const, applicationId };
}

function renderSelector(
  overrides: Partial<React.ComponentProps<typeof BaselineSelector>> = {},
) {
  const setResumeSource = vi.fn().mockResolvedValue(actionResult());
  const request = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: newerAssetId, originalName: "fresh.pdf", reused: false }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  );
  const props: React.ComponentProps<typeof BaselineSelector> = {
    applicationId,
    selectedAsset: null,
    availableAssets: assets,
    setupMode: true,
    setResumeSource,
    ...overrides,
  };
  vi.stubGlobal("fetch", request);
  return { ...render(<BaselineSelector {...props} />), setResumeSource, request };
}

describe("BaselineSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows optional setup choices and newest existing assets without storage metadata", () => {
    renderSelector();

    expect(screen.getByRole("heading", { name: "本次对照简历（可选）" })).toBeVisible();
    expect(screen.getAllByText("newer-resume.pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("older-resume.docx").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "暂时跳过，去分析 JD" })).toBeVisible();
    expect(screen.getByLabelText("上传新的 PDF 或 DOCX 简历")).toHaveAttribute(
      "accept",
      expect.stringContaining(".pdf"),
    );
    expect(screen.queryByText(/storage|sha256|signed/i)).not.toBeInTheDocument();
  });

  it("selects an existing asset once, exits setup, and refreshes", async () => {
    const user = userEvent.setup();
    const { setResumeSource } = renderSelector();

    await user.click(screen.getByRole("button", { name: /选择 newer-resume\.pdf/ }));

    await waitFor(() => expect(setResumeSource).toHaveBeenCalledOnce());
    const formData = setResumeSource.mock.calls[0][0] as FormData;
    expect(formData.get("applicationId")).toBe(applicationId);
    expect(formData.get("sourceAssetId")).toBe(newerAssetId);
    expect(router.replace).toHaveBeenCalledWith(
      `/applications/${applicationId}?tab=jd&setup=1`,
    );
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("collapses setup choices when refreshed props contain the selected asset", async () => {
    const user = userEvent.setup();
    const { setResumeSource, rerender } = renderSelector();

    await user.click(screen.getByRole("button", { name: /选择 newer-resume\.pdf/ }));
    await waitFor(() => expect(setResumeSource).toHaveBeenCalledOnce());

    rerender(
      <BaselineSelector
        applicationId={applicationId}
        selectedAsset={assets[0]}
        availableAssets={assets}
        setupMode={false}
        setResumeSource={setResumeSource}
      />,
    );

    expect(screen.getByText("newer-resume.pdf")).toBeVisible();
    expect(screen.queryByText("选择已有简历")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("上传新的 PDF 或 DOCX 简历")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更换简历" })).toBeVisible();
    expect(screen.getByRole("button", { name: "上传新简历" })).toBeVisible();
  });

  it("uploads only to the source asset endpoint, then selects the returned asset", async () => {
    const user = userEvent.setup();
    const { setResumeSource, request } = renderSelector();
    const input = screen.getByLabelText("上传新的 PDF 或 DOCX 简历");

    await user.upload(
      input,
      new File(["%PDF synthetic"], "fresh.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "上传并使用这份简历" }));

    await waitFor(() => expect(setResumeSource).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe("/api/source-assets");
    expect(request.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(request.mock.calls.some(([url]) => String(url).includes("/extract"))).toBe(false);
    expect((setResumeSource.mock.calls[0][0] as FormData).get("sourceAssetId")).toBe(
      newerAssetId,
    );
  });

  it("skips with null, exits setup, and does not call any gap endpoint", async () => {
    const user = userEvent.setup();
    const { setResumeSource, request } = renderSelector();

    await user.click(screen.getByRole("button", { name: "暂时跳过，去分析 JD" }));

    await waitFor(() => expect(setResumeSource).toHaveBeenCalledOnce());
    expect((setResumeSource.mock.calls[0][0] as FormData).get("sourceAssetId")).toBe("");
    expect(request).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(
      `/applications/${applicationId}?tab=jd&setup=1`,
    );
  });

  it("keeps an established workspace on the resume tab after changing baseline", async () => {
    const user = userEvent.setup();
    const { setResumeSource } = renderSelector({
      selectedAsset: assets[1],
      setupMode: false,
    });

    await user.click(screen.getByRole("button", { name: "更换简历" }));
    await user.click(screen.getByRole("button", { name: /选择 newer-resume\.pdf/ }));

    await waitFor(() => expect(setResumeSource).toHaveBeenCalledOnce());
    expect(router.replace).toHaveBeenCalledWith(
      `/applications/${applicationId}?tab=resume`,
    );
  });

  it("previews PDF and DOCX assets through the private endpoint", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(
      screen.getByRole("button", { name: "预览 newer-resume.pdf" }),
    );
    expect(
      screen.getByTitle("预览 newer-resume.pdf"),
    ).toHaveAttribute(
      "src",
      `/api/source-assets/${newerAssetId}/preview`,
    );

    await user.click(screen.getByRole("button", { name: "关闭预览" }));
    await user.click(
      screen.getByRole("button", { name: "预览 older-resume.docx" }),
    );
    expect(screen.getByTitle("预览 older-resume.docx")).toHaveAttribute(
      "src",
      `/api/source-assets/${assetId}/preview`,
    );
  });

  it("recovers focus and always offers a preview fallback", async () => {
    const user = userEvent.setup();
    renderSelector();
    const trigger = screen.getByRole("button", {
      name: "预览 newer-resume.pdf",
    });

    await user.click(trigger);
    expect(screen.getByRole("link", { name: "打开原文件" })).toHaveAttribute(
      "href",
      `/api/source-assets/${newerAssetId}/download`,
    );

    await user.click(screen.getByRole("button", { name: "关闭预览" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("preserves the current selection and reports specific failures", async () => {
    const user = userEvent.setup();
    const setResumeSource = vi.fn().mockResolvedValue({
      ok: false,
      error: "application-storage-error",
    });
    renderSelector({
      selectedAsset: assets[1],
      setupMode: false,
      setResumeSource,
    });

    expect(screen.getByText("older-resume.docx")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "更换简历" }));
    await user.click(screen.getByRole("button", { name: /选择 newer-resume\.pdf/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法保存这次简历选择");
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getAllByText("older-resume.docx").length).toBeGreaterThan(0);
  });

  it("preserves the current selection when a new upload is rejected", async () => {
    const user = userEvent.setup();
    const { setResumeSource, request } = renderSelector({
      selectedAsset: assets[1],
      setupMode: false,
    });
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "file-too-large" }), { status: 413 }),
    );

    await user.click(screen.getByRole("button", { name: "上传新简历" }));
    await user.upload(
      screen.getByLabelText("上传新的 PDF 或 DOCX 简历"),
      new File(["large"], "fresh.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "上传并使用这份简历" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("文件超过 10 MiB");
    expect(setResumeSource).not.toHaveBeenCalled();
    expect(screen.getAllByText("older-resume.docx").length).toBeGreaterThan(0);
  });

  it("refreshes after upload succeeds but linking fails, clears the file, and allows later selection", async () => {
    const user = userEvent.setup();
    const setResumeSource = vi.fn().mockResolvedValue({
      ok: false,
      error: "application-storage-error",
    });
    const { request, rerender } = renderSelector({
      selectedAsset: assets[1],
      setupMode: false,
      setResumeSource,
    });
    await user.click(screen.getByRole("button", { name: "上传新简历" }));
    const input = screen.getByLabelText("上传新的 PDF 或 DOCX 简历");
    await user.upload(
      input,
      new File(["%PDF synthetic"], "fresh.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "上传并使用这份简历" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法保存这次简历选择");
    expect(setResumeSource).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls.some(([url]) => String(url).includes("/extract"))).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalledOnce();
    expect((input as HTMLInputElement).files).toHaveLength(0);
    expect(screen.getAllByText("older-resume.docx").length).toBeGreaterThan(0);

    rerender(
      <BaselineSelector
        applicationId={applicationId}
        selectedAsset={assets[1]}
        availableAssets={[assets[0], assets[1], { ...assets[0], id: "44444444-4444-4444-8444-444444444444", originalName: "fresh.pdf" }]}
        setupMode={false}
        setResumeSource={vi.fn().mockResolvedValue(actionResult())}
      />,
    );
    expect(screen.getByRole("button", { name: /选择 fresh\.pdf/ })).toBeVisible();
  });

  it("renders available assets newest first", () => {
    renderSelector();
    const choices = screen.getAllByRole("button").filter((button) =>
      button.textContent?.includes("选择"),
    );
    expect(choices[0]).toHaveTextContent("newer-resume.pdf");
    expect(choices[1]).toHaveTextContent("older-resume.docx");
  });

  it("exposes pending state and accessible labels while selecting", async () => {
    const user = userEvent.setup();
    let resolveAction!: (result: ReturnType<typeof actionResult>) => void;
    const setResumeSource = vi.fn(
      () => new Promise<ReturnType<typeof actionResult>>((resolve) => (resolveAction = resolve)),
    );
    renderSelector({ setResumeSource });

    const choose = screen.getByRole("button", { name: /选择 newer-resume\.pdf/ });
    await user.click(choose);
    expect(choose).toBeDisabled();
    expect(screen.getByText("正在保存…")).toBeVisible();
    resolveAction(actionResult());
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
  });
});
