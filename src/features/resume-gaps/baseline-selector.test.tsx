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
    new Response(JSON.stringify({ id: newerAssetId, originalName: "fresh.pdf" }), {
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
    expect(screen.getByText("newer-resume.pdf")).toBeVisible();
    expect(screen.getAllByText("older-resume.docx").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "暂时跳过，进入工作区" })).toBeVisible();
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
      `/applications/${applicationId}?tab=resume`,
    );
    expect(router.refresh).toHaveBeenCalledOnce();
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

    await user.click(screen.getByRole("button", { name: "暂时跳过，进入工作区" }));

    await waitFor(() => expect(setResumeSource).toHaveBeenCalledOnce());
    expect((setResumeSource.mock.calls[0][0] as FormData).get("sourceAssetId")).toBe("");
    expect(request).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(
      `/applications/${applicationId}?tab=resume`,
    );
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
