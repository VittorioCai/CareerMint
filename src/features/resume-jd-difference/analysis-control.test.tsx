import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn() };

vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ResumeJDDifferenceAnalysisControl } from "./analysis-control";

const applicationId = "11111111-1111-4111-8111-111111111111";
const asset = {
  id: "22222222-2222-4222-8222-222222222222",
  originalName: "current-resume.pdf",
  contentType: "application/pdf",
  createdAt: "2026-08-28T10:00:00.000Z",
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderControl(
  overrides: Partial<
    React.ComponentProps<typeof ResumeJDDifferenceAnalysisControl>
  > = {},
) {
  const request = vi.fn<typeof fetch>();
  const refresh = vi.fn();
  const props: React.ComponentProps<
    typeof ResumeJDDifferenceAnalysisControl
  > = {
    applicationId,
    asset,
    initialRun: null,
    freshness: "missing",
    request,
    refresh,
    ...overrides,
  };
  return {
    ...render(<ResumeJDDifferenceAnalysisControl {...props} />),
    request,
    refresh,
  };
}

describe("ResumeJDDifferenceAnalysisControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not auto-run and asks for a baseline resume when none is selected", () => {
    const { request } = renderControl({ asset: null });

    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "先选择对照简历" })).toHaveAttribute(
      "href",
      `/applications/${applicationId}?tab=resume`,
    );
  });

  it("sends exactly one POST and refreshes after a successful result", async () => {
    const user = userEvent.setup();
    const { request, refresh } = renderControl();
    request.mockResolvedValueOnce(
      json({
        runId: "33333333-3333-4333-8333-333333333333",
        status: "succeeded",
        reused: false,
        freshness: "current",
        errorCode: null,
      }),
    );

    await user.click(screen.getByRole("button", { name: "开始差异分析" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith(
      `/api/applications/${applicationId}/resume-jd-difference/analyze`,
      {
        method: "POST",
        headers: { "x-resume-source-asset-id": asset.id },
      },
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("disables duplicate clicks while the single request is pending", async () => {
    const user = userEvent.setup();
    let resolve!: (response: Response) => void;
    const { request } = renderControl();
    request.mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );

    const button = screen.getByRole("button", { name: "开始差异分析" });
    await user.click(button);
    expect(screen.getByRole("button", { name: "正在分析…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "正在分析…" }));
    expect(request).toHaveBeenCalledTimes(1);
    resolve(
      json({
        status: "running",
        runId: "33333333-3333-4333-8333-333333333333",
        reused: true,
        freshness: "current",
        errorCode: null,
      }),
    );
  });

  it("renders current, stale, and running states without making requests", () => {
    const { request, rerender } = renderControl({
      initialRun: { status: "succeeded", errorCode: null },
      freshness: "current",
    });
    expect(screen.getByText(/分析已完成/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "重新分析" })).toBeEnabled();

    rerender(
      <ResumeJDDifferenceAnalysisControl
        applicationId={applicationId}
        asset={asset}
        initialRun={{ status: "succeeded", errorCode: null }}
        freshness="stale"
        request={request}
      />,
    );
    expect(screen.getByText(/材料已变化，请重新分析/u)).toBeVisible();

    rerender(
      <ResumeJDDifferenceAnalysisControl
        applicationId={applicationId}
        asset={asset}
        initialRun={{ status: "running", errorCode: null }}
        freshness="current"
        request={request}
      />,
    );
    expect(screen.getByText(/正在分析岗位与简历差异/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "正在分析…" })).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps a previous-result link visible when a new attempt fails", async () => {
    const user = userEvent.setup();
    const { request } = renderControl({ hasPreviousResult: true });
    request.mockResolvedValueOnce(
      json({
        runId: "33333333-3333-4333-8333-333333333333",
        status: "failed",
        reused: false,
        freshness: "current",
        errorCode: "ai-timeout",
      }),
    );

    await user.click(screen.getByRole("button", { name: "开始差异分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("分析服务响应超时");
    expect(screen.getByRole("link", { name: "查看上次结果" })).toHaveAttribute(
      "href",
      `/applications/${applicationId}?tab=difference&result=previous`,
    );
  });

  it("recovers a scanned PDF with browser OCR and submits the text once", async () => {
    const user = userEvent.setup();
    const ocrText =
      "Data analyst resume with SQL dashboards, stakeholder reporting, and measurable results.";
    const ocrPdf = vi.fn().mockResolvedValue(ocrText);
    const { request, refresh } = renderControl({ ocrPdf });
    request
      .mockResolvedValueOnce(
        json({
          runId: "33333333-3333-4333-8333-333333333333",
          status: "failed",
          reused: false,
          freshness: "current",
          errorCode: "resume-text-insufficient",
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(["scanned-pdf"], { type: "application/pdf" })),
      )
      .mockResolvedValueOnce(
        json({
          runId: "33333333-3333-4333-8333-333333333333",
          status: "succeeded",
          reused: false,
          freshness: "current",
          errorCode: null,
        }),
      );

    await user.click(screen.getByRole("button", { name: "开始差异分析" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "没有读到足够的简历文字",
    );
    await user.click(
      screen.getByRole("button", { name: "在本机识别扫描版 PDF" }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(ocrPdf).toHaveBeenCalledOnce();
    expect(request).toHaveBeenNthCalledWith(
      2,
      `/api/source-assets/${asset.id}/download`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      `/api/applications/${applicationId}/resume-jd-difference/analyze`,
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-resume-source-asset-id": asset.id,
        },
        body: JSON.stringify({ ocrText }),
      }),
    );
  });
});
