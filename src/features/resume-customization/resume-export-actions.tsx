"use client";

import { useState } from "react";

type ExportFormat = "docx" | "pdf";

function responseFilename(response: Response, format: ExportFormat) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const matched = /filename="([^"]+)"/.exec(disposition);
  return matched?.[1] ?? `resume.${format}`;
}

export function ResumeExportActions({
  applicationId,
  versionId,
}: {
  applicationId: string;
  versionId: string;
}) {
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function download(format: ExportFormat) {
    setBusyFormat(format);
    setMessage(null);
    setError(false);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/resume/${versionId}/export?format=${format}`,
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (body?.error === "pdf-unsupported-characters") {
          setMessage("PDF 暂不支持其中的文字，请下载 DOCX。");
        } else {
          setMessage("导出暂时失败，内容和版本都已保留，请稍后重试。");
        }
        setError(true);
        return;
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = responseFilename(response, format);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage(`${format.toUpperCase()} 下载已开始。`);
    } catch {
      setMessage("导出暂时失败，内容和版本都已保留，请稍后重试。");
      setError(true);
    } finally {
      setBusyFormat(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <button
          type="button"
          className="button-primary inline-flex min-h-10 items-center px-4 text-xs font-black disabled:cursor-wait disabled:opacity-60"
          disabled={busyFormat !== null}
          onClick={() => void download("docx")}
        >
          {busyFormat === "docx" ? "正在生成 DOCX…" : "下载 DOCX"}
        </button>
        <button
          type="button"
          className="button-secondary inline-flex min-h-10 items-center px-4 text-xs font-black disabled:cursor-wait disabled:opacity-60"
          disabled={busyFormat !== null}
          onClick={() => void download("pdf")}
        >
          {busyFormat === "pdf" ? "正在生成 PDF…" : "下载 PDF"}
        </button>
      </div>
      {message ? (
        <p
          className={`mt-2 text-[10px] font-black leading-4 ${error ? "text-[var(--error)]" : "text-[var(--ink-muted)]"}`}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
