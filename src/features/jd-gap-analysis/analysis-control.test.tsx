import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import {
  JDGapAnalysisControl,
  resolveBrowserOcrHook,
} from "./analysis-control";

const applicationId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const asset = {
  id: assetId,
  originalName: "selected-resume.pdf",
  contentType: "application/pdf",
  createdAt: "2026-08-25T10:00:00.000Z",
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderControl(
  overrides: Partial<React.ComponentProps<typeof JDGapAnalysisControl>> = {},
) {
  const request = vi.fn<typeof fetch>();
  const refresh = vi.fn();
  const props: React.ComponentProps<typeof JDGapAnalysisControl> = {
    applicationId,
    asset,
    initialRun: null,
    request,
    refresh,
    ...overrides,
  };
  return { ...render(<JDGapAnalysisControl {...props} />), request, refresh };
}

describe("JDGapAnalysisControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses an injected OCR hook only outside production", () => {
    const hook = vi.fn().mockResolvedValue("fixture OCR text");
    expect(resolveBrowserOcrHook("test", hook)).toBe(hook);
    expect(resolveBrowserOcrHook("production", hook)).toBeNull();
  });

  it("does not auto-run and disables analysis until a resume is selected", () => {
    const { request } = renderControl({ asset: null });

    expect(request).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "开始 JD 差距分析" }),
    ).toBeDisabled();
    expect(screen.getByRole("link", { name: "先选择对照简历" })).toHaveAttribute(
      "href",
      `/applications/${applicationId}?tab=resume`,
    );
  });

  it("follows nextPhase once and sends the selected asset on both requests", async () => {
    const user = userEvent.setup();
    const { request, refresh } = renderControl();
    request
      .mockResolvedValueOnce(json({
        status: "succeeded",
        phase: "structure",
        nextPhase: "comparison",
        reused: false,
      }))
      .mockResolvedValueOnce(json({
        status: "succeeded",
        phase: "complete",
        nextPhase: null,
        reused: false,
      }));

    await user.click(screen.getByRole("button", { name: "开始 JD 差距分析" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    for (const call of request.mock.calls) {
      expect(call[0]).toBe(`/api/applications/${applicationId}/jd-gap/analyze`);
      expect(call[1]).toMatchObject({
        method: "POST",
        headers: { "x-resume-source-asset-id": assetId },
      });
    }
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("never follows more than one next phase", async () => {
    const user = userEvent.setup();
    const { request } = renderControl();
    request
      .mockResolvedValueOnce(json({
        status: "succeeded",
        phase: "structure",
        nextPhase: "comparison",
      }))
      .mockResolvedValueOnce(json({
        status: "succeeded",
        phase: "structure",
        nextPhase: "comparison",
      }));

    await user.click(screen.getByRole("button", { name: "开始 JD 差距分析" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert")).toHaveTextContent("分析尚未完成");
  });

  it("shows stable running, reused, succeeded, and failed states", async () => {
    const user = userEvent.setup();
    const { request, rerender } = renderControl({
      initialRun: { status: "running", phase: "comparison", errorCode: null },
    });
    expect(screen.getByText("正在核对简历证据")).toBeVisible();
    expect(request).not.toHaveBeenCalled();

    rerender(
      <JDGapAnalysisControl
        applicationId={applicationId}
        asset={asset}
        initialRun={{ status: "succeeded", phase: "complete", errorCode: null }}
        request={request}
      />,
    );
    expect(screen.getByText("分析完成")).toBeVisible();

    request.mockResolvedValueOnce(json({
      status: "succeeded",
      phase: "complete",
      nextPhase: null,
      reused: true,
    }));
    await user.click(screen.getByRole("button", { name: "重新分析 JD 差距" }));
    expect(await screen.findByText(/已复用相同材料的分析结果/)).toBeVisible();

    request.mockResolvedValueOnce(json({
      status: "failed",
      phase: "comparison",
      errorCode: "jd-gap-failed",
    }));
    await user.click(screen.getByRole("button", { name: "重新分析 JD 差距" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("分析失败");
  });

  it("links consent errors to account settings", async () => {
    const user = userEvent.setup();
    const { request } = renderControl();
    request.mockResolvedValueOnce(
      json({ error: "ai-processing-consent-required" }, 403),
    );

    await user.click(screen.getByRole("button", { name: "开始 JD 差距分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("允许 AI 处理");
    expect(screen.getByRole("link", { name: "前往账户设置" })).toHaveAttribute(
      "href",
      "/settings/account",
    );
  });

  it("recovers a short scanned PDF with cancellable browser OCR", async () => {
    const user = userEvent.setup();
    let resolveOcr!: (text: string) => void;
    const ocrPdf = vi.fn(
      (_file: File, options?: { onProgress?: (value: { phase: "recognizing"; page: number; totalPages: number }) => void }) => {
        options?.onProgress?.({ phase: "recognizing", page: 2, totalPages: 3 });
        return new Promise<string>((resolve) => { resolveOcr = resolve; });
      },
    );
    const { request } = renderControl({ ocrPdf });
    request
      .mockResolvedValueOnce(json({
        status: "failed",
        phase: "comparison",
        errorCode: "resume-text-too-short",
      }))
      .mockResolvedValueOnce(
        new Response(new Blob(["%PDF"], { type: "application/pdf" }), { status: 200 }),
      );

    await user.click(screen.getByRole("button", { name: "开始 JD 差距分析" }));
    await user.click(await screen.findByRole("button", { name: "在本机识别扫描版 PDF" }));
    expect(await screen.findByText(/第 2\/3 页/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "取消本机识别" }));
    expect(screen.getByRole("alert")).toHaveTextContent("已取消本地识别");
    resolveOcr("must not be posted");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("submits recognized text and clears stale OCR after the run key changes", async () => {
    const user = userEvent.setup();
    const ocrPdf = vi.fn().mockResolvedValue("Verified OCR resume text");
    const { request, rerender } = renderControl({ ocrPdf, runKey: "old-run" });
    request
      .mockResolvedValueOnce(json({ status: "failed", phase: "comparison", errorCode: "resume-text-too-short" }))
      .mockResolvedValueOnce(new Response(new Blob(["%PDF"], { type: "application/pdf" }), { status: 200 }))
      .mockResolvedValueOnce(json({ status: "failed", phase: "comparison", errorCode: "network-error" }));

    await user.click(screen.getByRole("button", { name: "开始 JD 差距分析" }));
    await user.click(await screen.findByRole("button", { name: "在本机识别扫描版 PDF" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(request.mock.calls[2][1]).toMatchObject({
      body: JSON.stringify({ ocrText: "Verified OCR resume text" }),
    });

    rerender(
      <JDGapAnalysisControl
        applicationId={applicationId}
        asset={{ ...asset, id: "33333333-3333-4333-8333-333333333333" }}
        initialRun={null}
        runKey="new-run"
        request={request}
        ocrPdf={ocrPdf}
      />,
    );
    expect(screen.queryByRole("button", { name: "在本机识别扫描版 PDF" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始 JD 差距分析" })).toBeEnabled();
  });
});
