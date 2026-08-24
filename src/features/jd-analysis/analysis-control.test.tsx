import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AnalysisControl, type AnalysisSummary } from "./analysis-control";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const applicationId = "11111111-1111-4111-8111-111111111111";
const resultSummary: AnalysisSummary = {
  acceptedRequirementCount: 6,
  estimatedCost: { amount: 0.012, currency: "USD" },
};

describe("AnalysisControl", () => {
  it("does not call AI until the user explicitly clicks analyze", () => {
    const request = vi.fn();
    render(
      <AnalysisControl
        applicationId={applicationId}
        initialStatus={null}
        request={request}
      />,
    );

    expect(
      screen.getByText(/只有点击后，系统才会发送这份 JD/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "开始分析 JD" })).toBeVisible();
    expect(request).not.toHaveBeenCalled();
  });

  it("shows pending feedback and refreshes the server view after success", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const request = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const refresh = vi.fn();
    const user = userEvent.setup();
    render(
      <AnalysisControl
        applicationId={applicationId}
        initialStatus={null}
        request={request}
        refresh={refresh}
      />,
    );

    await user.click(screen.getByRole("button", { name: "开始分析 JD" }));
    expect(screen.getByRole("button", { name: "正在分析…" })).toBeDisabled();
    expect(request).toHaveBeenCalledWith(
      `/api/applications/${applicationId}/analyze`,
      { method: "POST" },
    );

    resolveRequest?.(
      Response.json({
        runId: "22222222-2222-4222-8222-222222222222",
        status: "succeeded",
        reused: false,
        errorCode: null,
      }),
    );
    expect(await screen.findByText("分析完成，匹配结果已更新。")).toBeVisible();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("links to account settings when AI consent is missing", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json(
        { error: "ai-processing-consent-required" },
        { status: 403 },
      ),
    );
    const user = userEvent.setup();
    render(
      <AnalysisControl
        applicationId={applicationId}
        initialStatus={null}
        request={request}
      />,
    );

    await user.click(screen.getByRole("button", { name: "开始分析 JD" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "先在账户设置中允许 AI 数据处理",
    );
    expect(screen.getByRole("link", { name: "前往账户设置" })).toHaveAttribute(
      "href",
      "/settings/account",
    );
  });

  it("keeps a retry path when the configured provider is unavailable", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        runId: "22222222-2222-4222-8222-222222222222",
        status: "failed",
        reused: false,
        errorCode: "jd-analysis-unavailable",
      }),
    );
    const user = userEvent.setup();
    render(
      <AnalysisControl
        applicationId={applicationId}
        initialStatus="failed"
        request={request}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重新分析 JD" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI 暂未配置，JD 和现有结果都已保留",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "重新分析 JD" })).toBeEnabled(),
    );
  });

  it("shows the real latest result count and cost in the compact status row", () => {
    render(
      <AnalysisControl
        applicationId={applicationId}
        initialStatus="succeeded"
        initialResult={resultSummary}
      />,
    );

    expect(screen.getByText("上次结果：6 项要求")).toBeVisible();
    expect(screen.getByText("预计成本 $0.012 USD")).toBeVisible();
  });

  it("synchronizes the state and action label when the analyze response reports a queued run", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({ status: "running", runId: "run-1", reused: false }),
    );
    const user = userEvent.setup();
    render(
      <AnalysisControl
        applicationId={applicationId}
        initialStatus={null}
        request={request}
      />,
    );

    await user.click(screen.getByRole("button", { name: "开始分析 JD" }));
    expect(screen.getByText("分析任务进行中")).toBeVisible();
    expect(screen.getByRole("button", { name: "检查分析状态" })).toBeVisible();
    expect(screen.queryByText("尚未分析这份 JD")).not.toBeInTheDocument();
  });

  it("synchronizes a succeeded run to a failed run without stale completion copy", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        status: "failed",
        runId: "run-2",
        reused: false,
        errorCode: "jd-analysis-failed",
      }),
    );
    const user = userEvent.setup();
    render(
      <AnalysisControl
        applicationId={applicationId}
        initialStatus="succeeded"
        initialResult={resultSummary}
        request={request}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重新检查匹配" }));

    expect(screen.getByText("上次分析未完成，可重试")).toBeVisible();
    expect(screen.getByRole("button", { name: "重新分析 JD" })).toBeVisible();
    expect(screen.queryByText("最近一次分析已完成")).not.toBeInTheDocument();
  });

  it("resets local status when the server prop changes to a new run", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({ status: "running", runId: "run-3", reused: false }),
    );
    const user = userEvent.setup();
    const { rerender } = render(
      <AnalysisControl
        applicationId={applicationId}
        initialStatus={null}
        request={request}
      />,
    );

    await user.click(screen.getByRole("button", { name: "开始分析 JD" }));
    rerender(
      <AnalysisControl applicationId={applicationId} initialStatus="failed" />,
    );

    expect(screen.getByText("上次分析未完成，可重试")).toBeVisible();
    expect(screen.getByRole("button", { name: "重新分析 JD" })).toBeVisible();
  });
});
