import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UploadForm } from "./upload-form";
import type { ScannedPdfOcrOptions } from "./ocr";

const assetId = "11111111-1111-4111-8111-111111111111";
const jobId = "33333333-3333-4333-8333-333333333333";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function selectAndUpload(request: ReturnType<typeof vi.fn>) {
  const user = userEvent.setup();
  const onUploaded = vi.fn();
  render(
    <UploadForm
      onUploaded={onUploaded}
      request={request as typeof fetch}
      pollIntervalMs={0}
    />,
  );
  const input = screen.getByLabelText("上传现有简历");
  await user.upload(
    input,
    new File(["%PDF synthetic"], "resume.pdf", {
      type: "application/pdf",
    }),
  );
  expect((input as HTMLInputElement).files).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "上传并开始建档" }));
  return { user, onUploaded, input };
}

describe("UploadForm", () => {
  it("accepts only PDF/DOCX and automatically extracts and polls to success", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: assetId, originalName: "resume.pdf" }, 201),
      )
      .mockResolvedValueOnce(jsonResponse({ jobId, status: "running" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: jobId, status: "succeeded", result: {} }),
      );

    const { onUploaded, input } = await selectAndUpload(request);

    expect(input).toHaveAttribute(
      "accept",
      ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    await screen.findByText("简历分析完成");
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[0][0]).toBe("/api/source-assets");
    expect(request.mock.calls[1][0]).toBe(
      `/api/source-assets/${assetId}/extract`,
    );
    expect(request.mock.calls[2][0]).toBe(`/api/jobs/${jobId}`);
    expect(onUploaded).toHaveBeenCalledWith({
      id: assetId,
      originalName: "resume.pdf",
    });
  });

  it("offers retry without uploading the saved asset again", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: assetId, originalName: "resume.pdf" }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: "resume-extraction-request-failed" }, 500),
      )
      .mockResolvedValueOnce(jsonResponse({ jobId, status: "succeeded" }));
    const { user } = await selectAndUpload(request);

    expect(await screen.findByText("resume.pdf 已安全保存")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重新尝试" }));
    await screen.findByText("简历分析完成");

    expect(
      request.mock.calls.filter(([url]) => url === "/api/source-assets"),
    ).toHaveLength(1);
  });

  it("explains consent and retries extraction without re-uploading", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: assetId, originalName: "resume.pdf" }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: "ai-processing-consent-required" }, 403),
      )
      .mockResolvedValueOnce(jsonResponse({ jobId, status: "succeeded" }));
    const { user } = await selectAndUpload(request);

    expect(
      await screen.findByText(/文件已保存在你的私有空间/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "授权后重试" }));
    await screen.findByText("简历分析完成");

    expect(
      request.mock.calls.filter(([url]) => url === "/api/source-assets"),
    ).toHaveLength(1);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  });

  it("falls back to injected OCR after a polled PDF too-short failure and submits OCR text", async () => {
    const ocrText =
      "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";
    let resolveOcr!: (text: string) => void;
    const ocrResult = new Promise<string>((resolve) => {
      resolveOcr = resolve;
    });
    const ocrPdf = vi.fn(async (_file: File, options?: ScannedPdfOcrOptions) => {
      options?.onProgress?.({ phase: "loading-model" });
      options?.onProgress?.({ phase: "recognizing", page: 2, totalPages: 3 });
      return ocrResult;
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: assetId, originalName: "resume.pdf" }, 201),
      )
      .mockResolvedValueOnce(jsonResponse({ jobId, status: "running" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: jobId, status: "failed", errorCode: "resume-text-too-short" }),
      )
      .mockResolvedValueOnce(jsonResponse({ jobId, status: "running" }))
      .mockResolvedValueOnce(jsonResponse({ id: jobId, status: "succeeded", result: {} }));

    const user = userEvent.setup();
    render(
      <UploadForm
        request={request as typeof fetch}
        ocrPdf={ocrPdf}
        pollIntervalMs={0}
      />,
    );
    const input = screen.getByLabelText("上传现有简历");
    await user.upload(
      input,
      new File(["%PDF synthetic"], "resume.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "上传并开始建档" }));

    expect(await screen.findByText("正在本地识别扫描版简历（第 2/3 页）")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("max", "3");
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "2");
    resolveOcr(ocrText);
    await screen.findByText("简历分析完成");

    expect(ocrPdf).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenNthCalledWith(
      4,
      `/api/source-assets/${assetId}/extract`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ocrText }),
      },
    );
  });

  it("retries a failed OCR submission with cached text without re-running OCR or uploading", async () => {
    const ocrText =
      "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";
    const ocrPdf = vi.fn().mockResolvedValue(ocrText);
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: assetId, originalName: "resume.pdf" }, 201),
      )
      .mockResolvedValueOnce(jsonResponse({ jobId, status: "running" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: jobId, status: "failed", errorCode: "resume-text-too-short" }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "resume-extraction-request-failed" }, 500))
      .mockResolvedValueOnce(jsonResponse({ jobId, status: "running" }))
      .mockResolvedValueOnce(jsonResponse({ id: jobId, status: "succeeded", result: {} }));

    const user = userEvent.setup();
    render(
      <UploadForm
        request={request as typeof fetch}
        ocrPdf={ocrPdf}
        pollIntervalMs={0}
      />,
    );
    const input = screen.getByLabelText("上传现有简历");
    await user.upload(
      input,
      new File(["%PDF synthetic"], "resume.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "上传并开始建档" }));

    await screen.findByRole("button", { name: "重新尝试" });
    await user.click(screen.getByRole("button", { name: "重新尝试" }));
    await screen.findByText("简历分析完成");

    expect(ocrPdf).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.filter(([url]) => url === "/api/source-assets")).toHaveLength(1);
    expect(request.mock.calls[4]).toEqual([
      `/api/source-assets/${assetId}/extract`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ocrText }),
      },
    ]);
  });

  it("aborts local OCR on cancel without submitting OCR JSON", async () => {
    const ocrPdf = vi.fn(
      (_file: File, options?: { signal?: AbortSignal }) =>
        new Promise<string>((_, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }),
    );
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: assetId, originalName: "resume.pdf" }, 201),
      )
      .mockResolvedValueOnce(jsonResponse({ jobId, status: "running" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: jobId, status: "failed", errorCode: "resume-text-too-short" }),
      );

    const user = userEvent.setup();
    render(
      <UploadForm
        request={request as typeof fetch}
        ocrPdf={ocrPdf}
        pollIntervalMs={0}
      />,
    );
    await user.upload(
      screen.getByLabelText("上传现有简历"),
      new File(["%PDF synthetic"], "resume.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "上传并开始建档" }));

    const cancel = await screen.findByRole("button", { name: "取消本地识别" });
    await user.click(cancel);
    expect(await screen.findByText("已取消本地识别，可重新尝试。")) .toBeVisible();
    expect(request).not.toHaveBeenCalledWith(
      `/api/source-assets/${assetId}/extract`,
      expect.objectContaining({ headers: { "content-type": "application/json" } }),
    );
  });

  it.each([
    ["DOCX", "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["AI provider", "resume.pdf", "application/pdf"],
  ])("does not run OCR for %s failures", async (label, fileName, type) => {
    const ocrPdf = vi.fn().mockResolvedValue("never used");
    const errorCode = label === "DOCX" ? "resume-text-too-short" : "ai-provider-authentication-failed";
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: assetId, originalName: fileName }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: "failed", errorCode }),
      );

    const user = userEvent.setup();
    render(
      <UploadForm
        request={request as typeof fetch}
        ocrPdf={ocrPdf}
        pollIntervalMs={0}
      />,
    );
    await user.upload(
      screen.getByLabelText("上传现有简历"),
      new File(["synthetic"], fileName, { type }),
    );
    await user.click(screen.getByRole("button", { name: "上传并开始建档" }));

    await screen.findByRole("alert");
    expect(ocrPdf).not.toHaveBeenCalled();
  });

  it("falls back to OCR when the immediate extraction response is failed with a too-short error code", async () => {
    const ocrText =
      "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";
    const ocrPdf = vi.fn().mockResolvedValue(ocrText);
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: assetId, originalName: "resume.pdf" }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: "failed", errorCode: "resume-text-too-short" }),
      )
      .mockResolvedValueOnce(jsonResponse({ jobId, status: "running" }))
      .mockResolvedValueOnce(jsonResponse({ id: jobId, status: "succeeded", result: {} }));

    const user = userEvent.setup();
    render(
      <UploadForm
        request={request as typeof fetch}
        ocrPdf={ocrPdf}
        pollIntervalMs={0}
      />,
    );
    await user.upload(
      screen.getByLabelText("上传现有简历"),
      new File(["%PDF synthetic"], "resume.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "上传并开始建档" }));

    await screen.findByText("简历分析完成");
    expect(ocrPdf).toHaveBeenCalledTimes(1);
  });

  it("labels the file picker in the interface language and names the chosen file", async () => {
    // A bare file input renders "Choose File / No file chosen" in the browser's
    // locale. That text is not ours to translate or style, so a Chinese
    // interface shows an English control at the very first step of the product.
    const user = userEvent.setup();
    render(<UploadForm request={vi.fn()} onUploaded={vi.fn()} />);

    expect(screen.getByText("选择文件")).toBeVisible();
    expect(screen.getByText("尚未选择文件")).toBeVisible();

    await user.upload(
      screen.getByLabelText("上传现有简历"),
      new File(["%PDF-1.4"], "Vittorio_Cai_CV.pdf", { type: "application/pdf" }),
    );

    expect(screen.getByText("Vittorio_Cai_CV.pdf")).toBeVisible();
    expect(screen.queryByText("尚未选择文件")).not.toBeInTheDocument();
  });
});
