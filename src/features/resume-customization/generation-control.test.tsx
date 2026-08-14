import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ResumeGenerationControl } from "./generation-control";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const applicationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

describe("ResumeGenerationControl", () => {
  it("does not call AI before the explicit generation click", () => {
    const request = vi.fn();
    render(
      <ResumeGenerationControl
        applicationId={applicationId}
        initialStatus={null}
        request={request}
      />,
    );

    expect(screen.getByText(/只有点击后，系统才会把 JD/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "生成岗位简历建议" }),
    ).toBeVisible();
    expect(request).not.toHaveBeenCalled();
  });

  it("shows busy feedback and opens the review workspace after success", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const request = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const navigate = vi.fn();
    const user = userEvent.setup();
    render(
      <ResumeGenerationControl
        applicationId={applicationId}
        initialStatus={null}
        request={request}
        navigate={navigate}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "生成岗位简历建议" }),
    );
    expect(screen.getByRole("button", { name: "正在生成…" })).toBeDisabled();
    expect(request).toHaveBeenCalledWith(
      `/api/applications/${applicationId}/resume/generate`,
      { method: "POST" },
    );
    resolveRequest?.(
      Response.json({ status: "succeeded", runId, reused: false }),
    );

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        `/applications/${applicationId}/resume/${runId}`,
      ),
    );
  });

  it("explains missing prerequisites without losing the application", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "jd-analysis-required" }, { status: 409 }),
      );
    const user = userEvent.setup();
    render(
      <ResumeGenerationControl
        applicationId={applicationId}
        initialStatus={null}
        request={request}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "生成岗位简历建议" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "先在 JD 标签完成岗位分析",
    );
  });

  it("keeps a retry path when production AI is not configured", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        status: "failed",
        runId,
        reused: false,
        errorCode: "resume-generation-unavailable",
      }),
    );
    const user = userEvent.setup();
    render(
      <ResumeGenerationControl
        applicationId={applicationId}
        initialStatus="failed"
        request={request}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "重新生成简历建议" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI 暂未配置，现有版本和职业事实都已保留",
    );
  });
});
