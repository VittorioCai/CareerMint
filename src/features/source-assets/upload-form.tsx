"use client";

import { type FormEvent, useRef, useState } from "react";

type UploadResult = { id: string; originalName: string };

type UploadFormProps = {
  onUploaded?(result: UploadResult): void;
  onExtractionComplete?(): void;
  beforeExtract?: () => Promise<void>;
  request?: typeof fetch;
  pollIntervalMs?: number;
};

const errorCopy: Record<string, string> = {
  "empty-file": "这个文件是空的，请选择另一份简历。",
  "file-too-large": "文件超过 10 MiB，请压缩后重试。",
  "unsupported-content-type": "目前只支持 PDF 和 DOCX 文件。",
  "unsupported-file-signature": "文件内容与支持的简历格式不符。",
  "content-type-mismatch": "文件扩展名和实际内容不一致。",
  "missing-file": "请先选择一份简历。",
  unauthorized: "登录已失效，请重新登录。",
  "upload-failed": "上传没有完成，请重试。",
  "resume-extraction-request-failed": "分析暂时没有完成，请重新尝试。",
};

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function UploadForm({
  onUploaded = () => undefined,
  onExtractionComplete,
  beforeExtract,
  request = fetch,
  pollIntervalMs = 1_000,
}: UploadFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [asset, setAsset] = useState<UploadResult | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "uploading" | "extracting" | "succeeded" | "failed" | "consent"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  async function pollJob(jobId: string) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await wait(pollIntervalMs);
      const response = await request(`/api/jobs/${jobId}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error("resume-extraction-request-failed");
      if (body.status === "succeeded") return;
      if (body.status === "failed") {
        throw new Error(
          typeof body.errorCode === "string"
            ? body.errorCode
            : "resume-extraction-request-failed",
        );
      }
    }
    throw new Error("resume-extraction-request-failed");
  }

  async function extract(savedAsset: UploadResult) {
    setPhase("extracting");
    setError(null);
    try {
      await beforeExtract?.();
      const response = await request(
        `/api/source-assets/${savedAsset.id}/extract`,
        { method: "POST" },
      );
      const body = await responseBody(response);
      if (
        response.status === 403 &&
        body.error === "ai-processing-consent-required"
      ) {
        setPhase("consent");
        setError(
          "文件已保存在你的私有空间。授权 AI 文字分析后可继续，不需要重新上传。",
        );
        return;
      }
      if (!response.ok || typeof body.status !== "string") {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "resume-extraction-request-failed",
        );
      }
      if (body.status === "failed") {
        throw new Error("resume-extraction-request-failed");
      }
      if (body.status !== "succeeded") {
        if (typeof body.jobId !== "string") {
          throw new Error("resume-extraction-request-failed");
        }
        await pollJob(body.jobId);
      }
      setPhase("succeeded");
      onExtractionComplete?.();
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setPhase("failed");
      setError(errorCopy[code] ?? "分析暂时没有完成，请重新尝试。");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError(errorCopy["missing-file"]);
      return;
    }

    setPhase("uploading");
    setError(null);
    const body = new FormData();
    body.set("file", file);

    try {
      const response = await request("/api/source-assets", {
        method: "POST",
        body,
      });
      const payload = await responseBody(response);
      if (
        response.status !== 201 ||
        typeof payload.id !== "string" ||
        typeof payload.originalName !== "string"
      ) {
        const code = typeof payload.error === "string" ? payload.error : "";
        throw new Error(code || "upload-failed");
      }

      const savedAsset = {
        id: payload.id,
        originalName: payload.originalName,
      };
      setAsset(savedAsset);
      onUploaded(savedAsset);
      await extract(savedAsset);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setPhase("failed");
      setError(errorCopy[code] ?? "上传失败，请稍后重试。");
    }
  }

  const busy = phase === "uploading" || phase === "extracting";

  return (
    <form
      className="dense-surface min-w-0 p-5 sm:p-6"
      onSubmit={handleSubmit}
      noValidate
    >
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
          className="form-input max-w-full file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--mint)] file:px-3 file:py-1.5 file:text-sm file:font-black"
          disabled={busy || asset !== null}
          required={!asset}
        />
        <p className="mt-2 text-xs font-medium text-[var(--ink-muted)]">
          支持 PDF、DOCX，最大 10 MiB。原文件只保存在你的私有空间。
        </p>
      </div>

      {asset ? (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3 text-sm">
          <p className="break-words font-black">{asset.originalName} 已安全保存</p>
          <p className="mt-1 text-xs font-medium text-[var(--ink-muted)]">
            重试分析不会再次上传，也不会创建重复任务。
          </p>
        </div>
      ) : null}

      {busy ? (
        <div className="mt-4" aria-live="polite">
          <p className="text-sm font-black">
            {phase === "uploading" ? "正在安全上传…" : "正在分析，离开页面也不会丢失任务…"}
          </p>
          <progress className="mt-2 h-2 w-full accent-[var(--coral)]" />
        </div>
      ) : null}

      {phase === "succeeded" ? (
        <p className="mt-4 rounded-xl border border-[var(--ink)] bg-[var(--mint)] p-3 text-sm font-black" role="status">
          <span aria-hidden="true">✓ </span>
          <span>简历分析完成</span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}

      {!asset ? (
        <button
          type="submit"
          className="button-primary mt-5 min-h-11 px-5 text-sm font-black disabled:cursor-wait disabled:opacity-60"
          disabled={busy}
        >
          {phase === "uploading" ? "正在上传…" : "上传并开始建档"}
        </button>
      ) : phase === "failed" || phase === "consent" ? (
        <button
          type="button"
          className="button-primary mt-5 min-h-11 px-5 text-sm font-black disabled:cursor-wait disabled:opacity-60"
          disabled={busy}
          onClick={() => void extract(asset)}
        >
          {phase === "consent" ? "授权后重试" : "重新尝试"}
        </button>
      ) : null}
    </form>
  );
}
