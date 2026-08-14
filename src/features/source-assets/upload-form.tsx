"use client";

import { type FormEvent, useRef, useState } from "react";

type UploadResult = { id: string; originalName: string };

type UploadFormProps = {
  onUploaded(result: UploadResult): void;
};

const errorCopy: Record<string, string> = {
  "empty-file": "这个文件是空的，请选择另一份简历。",
  "file-too-large": "文件超过 10 MiB，请压缩后重试。",
  "unsupported-content-type": "目前只支持 PDF 和 DOCX 文件。",
  "unsupported-file-signature": "文件内容与支持的简历格式不符。",
  "content-type-mismatch": "文件扩展名和实际内容不一致。",
  "missing-file": "请先选择一份简历。",
  unauthorized: "登录已失效，请重新登录。",
  "upload-failed": "上传没有完成，草稿没有丢失，请重试。",
};

function parseResponse(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function UploadForm({ onUploaded }: UploadFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError(errorCopy["missing-file"]);
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    const body = new FormData();
    body.set("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", "/api/source-assets");
    request.upload.addEventListener("progress", (uploadEvent) => {
      if (uploadEvent.lengthComputable) {
        setProgress(Math.round((uploadEvent.loaded / uploadEvent.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      setUploading(false);
      const response = parseResponse(request.responseText);
      if (
        request.status === 201 &&
        typeof response.id === "string" &&
        typeof response.originalName === "string"
      ) {
        setProgress(100);
        onUploaded({ id: response.id, originalName: response.originalName });
        form.reset();
        return;
      }

      const code = typeof response.error === "string" ? response.error : "";
      setError(errorCopy[code] ?? "上传失败，请稍后重试。");
    });
    request.addEventListener("error", () => {
      setUploading(false);
      setError("网络连接中断，请检查网络后重试。");
    });
    request.send(body);
  }

  return (
    <form className="dense-surface p-5 sm:p-6" onSubmit={handleSubmit}>
      <div>
        <label className="form-label" htmlFor="resume-source">
          上传现有简历
        </label>
        <input
          ref={inputRef}
          id="resume-source"
          name="file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="form-input file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--mint)] file:px-3 file:py-1.5 file:text-sm file:font-black"
          disabled={uploading}
          required
        />
        <p className="mt-2 text-xs font-medium text-[var(--ink-muted)]">
          支持 PDF、DOCX，最大 10 MiB。文件会存入你的私有空间。
        </p>
      </div>

      {uploading ? (
        <div className="mt-4" aria-live="polite">
          <div className="mb-2 flex justify-between text-xs font-bold">
            <span>正在上传</span>
            <span>{progress}%</span>
          </div>
          <progress className="h-2 w-full accent-[var(--coral)]" max={100} value={progress}>
            {progress}%
          </progress>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="button-primary mt-5 min-h-11 px-5 text-sm font-black disabled:cursor-wait disabled:opacity-60"
        disabled={uploading}
      >
        {uploading ? "正在上传…" : "上传并开始建档"}
      </button>
    </form>
  );
}
