import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { GapAnalysisControl } from "./gap-analysis-control";

const appId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";

function renderControl(overrides: Partial<React.ComponentProps<typeof GapAnalysisControl>> = {}) {
  const request = vi.fn<typeof fetch>();
  const refresh = vi.fn();
  const props: React.ComponentProps<typeof GapAnalysisControl> = {
    applicationId: appId,
    asset: {
      id: assetId,
      originalName: "scanned-resume.pdf",
      contentType: "application/pdf",
      createdAt: "2026-08-24T10:00:00.000Z",
    },
    initialRun: null,
    request,
    refresh,
    ...overrides,
  };
  return { ...render(<GapAnalysisControl {...props} />), request, refresh };
}

describe("GapAnalysisControl", () => {
  it("does not call the gap endpoint until the explicit analysis click", async () => {
    const user = userEvent.setup();
    const { request } = renderControl();
    expect(request).not.toHaveBeenCalled();

    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ runId: "run", status: "succeeded", reused: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await user.click(screen.getByRole("button", { name: "分析简历差距" }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0][0]).toBe(`/api/applications/${appId}/resume/gaps/analyze`);
    expect(request.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("offers browser OCR only for a short PDF, downloads once, and posts strict OCR JSON", async () => {
    const user = userEvent.setup();
    const ocrPdf = vi.fn().mockImplementation(async (_file: File, options?: { onProgress?: (progress: { phase: "recognizing"; page: number; totalPages: number }) => void }) => {
      options?.onProgress?.({ phase: "recognizing", page: 1, totalPages: 2 });
      return "Verified resume text";
    });
    const { request } = renderControl({ ocrPdf });
    request
      .mockResolvedValueOnce(new Response(JSON.stringify({ runId: "run", status: "failed", errorCode: "resume-text-too-short" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(["%PDF"], { type: "application/pdf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ runId: "run", status: "succeeded", reused: false }), { status: 200 }));

    await user.click(screen.getByRole("button", { name: "分析简历差距" }));
    await screen.findByRole("button", { name: "在本机识别扫描版 PDF" });
    await user.click(screen.getByRole("button", { name: "在本机识别扫描版 PDF" }));

    await waitFor(() => expect(ocrPdf).toHaveBeenCalledOnce());
    expect(request.mock.calls[1][0]).toBe(`/api/source-assets/${assetId}/download`);
    expect(request.mock.calls[1][1]).toMatchObject({ method: "GET" });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(request.mock.calls[2][1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ocrText: "Verified resume text" }),
    });
  });

  it("uses cached OCR text when the OCR submission is retried", async () => {
    const user = userEvent.setup();
    const ocrPdf = vi.fn().mockResolvedValue("Cached resume text");
    const { request } = renderControl({ ocrPdf });
    request
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "failed", errorCode: "resume-text-too-short" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(["%PDF"], { type: "application/pdf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "failed", errorCode: "network-error" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "succeeded", reused: true }), { status: 200 }));

    await user.click(screen.getByRole("button", { name: "分析简历差距" }));
    await user.click(await screen.findByRole("button", { name: "在本机识别扫描版 PDF" }));
    await user.click(await screen.findByRole("button", { name: "重试分析" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    expect(ocrPdf).toHaveBeenCalledOnce();
    expect(request.mock.calls[3][0]).toBe(`/api/applications/${appId}/resume/gaps/analyze`);
    expect(request.mock.calls[3][1]).toMatchObject({ body: JSON.stringify({ ocrText: "Cached resume text" }) });
  });

  it("does not offer OCR for a DOCX parse failure", async () => {
    const user = userEvent.setup();
    const { request } = renderControl({
      asset: {
        id: assetId,
        originalName: "resume.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        createdAt: "2026-08-24T10:00:00.000Z",
      },
    });
    request.mockResolvedValueOnce(new Response(JSON.stringify({ status: "failed", errorCode: "resume-text-too-short" }), { status: 200 }));
    await user.click(screen.getByRole("button", { name: "分析简历差距" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("分析没有完成"));
    expect(screen.queryByRole("button", { name: "在本机识别扫描版 PDF" })).not.toBeInTheDocument();
  });

  it("shows consent and download failures as actionable states", async () => {
    const user = userEvent.setup();
    const { request } = renderControl();
    request.mockResolvedValueOnce(new Response(JSON.stringify({ error: "ai-processing-consent-required" }), { status: 403 }));
    await user.click(screen.getByRole("button", { name: "分析简历差距" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("允许 AI 处理");
    expect(screen.getByRole("link", { name: "前往账户设置" })).toHaveAttribute("href", "/settings/account");
    expect(screen.getByRole("button", { name: "重试分析" })).toBeVisible();

    request
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "failed", errorCode: "resume-text-too-short" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 403 }));
    await user.click(screen.getByRole("button", { name: "重试分析" }));
    await user.click(await screen.findByRole("button", { name: "在本机识别扫描版 PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("无法下载");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("can cancel OCR after progress without posting recognized text", async () => {
    const user = userEvent.setup();
    let resolveOcr!: (text: string) => void;
    const ocrPdf = vi.fn((_file: File, options?: { onProgress?: (progress: { phase: "recognizing"; page: number; totalPages: number }) => void }) => {
      options?.onProgress?.({ phase: "recognizing", page: 2, totalPages: 4 });
      return new Promise<string>((resolve) => { resolveOcr = resolve; });
    });
    const { request } = renderControl({ ocrPdf });
    request
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "failed", errorCode: "resume-text-too-short" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(["%PDF"], { type: "application/pdf" }), { status: 200 }));
    await user.click(screen.getByRole("button", { name: "分析简历差距" }));
    await user.click(await screen.findByRole("button", { name: "在本机识别扫描版 PDF" }));
    expect(await screen.findByText(/第 2\/4 页/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "取消本机识别" }));
    expect(screen.getByRole("alert")).toHaveTextContent("已取消本地识别");
    expect(request).toHaveBeenCalledTimes(2);
    resolveOcr("must not be posted");
  });
});
