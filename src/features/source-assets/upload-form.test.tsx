import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UploadForm } from "./upload-form";

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
});
