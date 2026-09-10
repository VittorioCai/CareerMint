import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { zhCN } from "@/i18n/dictionaries/zh-CN";

import { ResumeFileDeleteControl } from "./resume-file-delete-control";

const assetId = "22222222-2222-4222-8222-222222222222";

function renderControl(
  overrides: Partial<React.ComponentProps<typeof ResumeFileDeleteControl>> = {},
) {
  const onDeleted = vi.fn();
  render(
    <ResumeFileDeleteControl
      assetId={assetId}
      originalName="resume.pdf"
      status="ready"
      applicationCount={0}
      confirmedFactCount={0}
      onDeleted={onDeleted}
      copy={zhCN.resume}
      common={zhCN.common}
      {...overrides}
    />,
  );
  return { onDeleted };
}

function respondWith(response: Partial<Response>) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, ...response });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ResumeFileDeleteControl", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("stays collapsed behind a per-file button until asked", () => {
    respondWith({});
    renderControl();

    expect(screen.getByRole("button", { name: "删除 resume.pdf" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says the file is unreferenced when nothing points at it", async () => {
    respondWith({});
    renderControl();

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));

    const panel = screen.getByRole("alert");
    expect(panel).toHaveTextContent("确定删除 resume.pdf？");
    expect(panel).toHaveTextContent("目前没有投递或职业事实引用这个文件。");
    expect(panel).toHaveTextContent("原文件不能恢复，需要时请重新上传。");
  });

  it("names both costs before the user commits", async () => {
    respondWith({});
    renderControl({ applicationCount: 2, confirmedFactCount: 5 });

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "这份简历是 2 份投递的对照简历，也是 5 条已确认职业事实的来源。",
    );
  });

  it("names only the applications when no facts came from the file", async () => {
    respondWith({});
    renderControl({ applicationCount: 1, confirmedFactCount: 0 });

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));

    const panel = screen.getByRole("alert");
    expect(panel).toHaveTextContent("这份简历是 1 份投递的对照简历。");
    expect(panel).not.toHaveTextContent("职业事实的来源");
  });

  it("names only the facts when no application uses the file", async () => {
    respondWith({});
    renderControl({ applicationCount: 0, confirmedFactCount: 3 });

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));

    const panel = screen.getByRole("alert");
    expect(panel).toHaveTextContent("这份简历是 3 条已确认职业事实的来源。");
    expect(panel).not.toHaveTextContent("份投递的对照简历");
  });

  it("warns that deleting mid-extraction throws away the extraction", async () => {
    respondWith({});
    renderControl({ status: "extracting" });

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "这个文件正在提取中，删除后本次提取会失败，已提取的内容不会保存。",
    );
  });

  it("cancels without sending anything", async () => {
    const fetchMock = respondWith({});
    const { onDeleted } = renderControl();

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("deletes on confirmation and reports it upward", async () => {
    const fetchMock = respondWith({});
    const { onDeleted } = renderControl();

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "确认删除文件" }));

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `/api/source-assets/${assetId}`,
      { method: "DELETE" },
    );
    expect(onDeleted).toHaveBeenCalledExactlyOnceWith();
  });

  it("treats an already-deleted file as success rather than an error", async () => {
    respondWith({ ok: false, status: 404 });
    const { onDeleted } = renderControl();

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "确认删除文件" }));

    expect(onDeleted).toHaveBeenCalledExactlyOnceWith();
  });

  it("keeps the panel open with an explanation when the delete fails", async () => {
    respondWith({ ok: false, status: 500 });
    const { onDeleted } = renderControl();

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "确认删除文件" }));

    expect(screen.getByRole("alert")).toHaveTextContent("文件没有删除成功，请重试。");
    expect(screen.getByRole("button", { name: "确认删除文件" })).toBeVisible();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("explains a conflict differently from a generic failure", async () => {
    respondWith({ ok: false, status: 409 });
    renderControl();

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "确认删除文件" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "这个文件还在被其他记录占用，暂时无法删除。",
    );
  });

  it("survives the network dropping without claiming the file is gone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { onDeleted } = renderControl();

    await userEvent.click(screen.getByRole("button", { name: "删除 resume.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "确认删除文件" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "网络连接中断，文件没有被删除。",
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
