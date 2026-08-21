"use client";

import { type FormEvent, useRef, useState } from "react";

import type { OcrProgress, ScannedPdfOcrOptions } from "./ocr";

type UploadResult = { id: string; originalName: string };

type UploadFormProps = {
  onUploaded?(result: UploadResult): void;
  onExtractionComplete?(): void;
  beforeExtract?: () => Promise<void>;
  request?: typeof fetch;
  pollIntervalMs?: number;
  ocrPdf?: (file: File, options?: ScannedPdfOcrOptions) => Promise<string>;
};

const defaultOcrPdf = async (
  file: File,
  options?: ScannedPdfOcrOptions,
) => {
  const { extractScannedPdfText } = await import("./ocr");
  return extractScannedPdfText(file, options);
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
  "resume-text-too-short": "简历文字太少，无法完成分析。",
  "resume-ocr-too-many-pages": "扫描版简历页数超过 10 页，请精简后重试。",
  "resume-ocr-unavailable": "本地识别暂时不可用，请重试或上传文字版简历。",
  "ocr-request-too-large": "识别文字超过大小限制，请精简后重试。",
  "ai-provider-authentication-failed": "AI 服务授权暂时失效，请稍后重试。",
  AbortError: "已取消本地识别，可重新尝试。",
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

function errorCode(caught: unknown) {
  if (
    (caught instanceof DOMException && caught.name === "AbortError") ||
    (caught instanceof Error && caught.name === "AbortError")
  ) {
    return "AbortError";
  }
  return caught instanceof Error ? caught.message : "";
}

function isPdf(file: File) {
  return file.type === "application/pdf";
}

type ExtractionOutcome = "succeeded" | "consent";

class ExtractionFailure extends Error {
  constructor(
    message: string,
    readonly hasErrorCode = false,
  ) {
    super(message);
    this.name = "ExtractionFailure";
  }
}

export function UploadForm({
  onUploaded = () => undefined,
  onExtractionComplete,
  beforeExtract,
  request = fetch,
  pollIntervalMs = 1_000,
  ocrPdf = defaultOcrPdf,
}: UploadFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);
  const cachedOcrTextRef = useRef<string | null>(null);
  const ocrAbortControllerRef = useRef<AbortController | null>(null);
  const [asset, setAsset] = useState<UploadResult | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "uploading" | "extracting" | "ocr" | "succeeded" | "failed" | "consent"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);

  async function pollJob(jobId: string) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await wait(pollIntervalMs);
      const response = await request(`/api/jobs/${jobId}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await responseBody(response);
      if (body.status === "failed") {
        throw new ExtractionFailure(
          typeof body.errorCode === "string"
            ? body.errorCode
            : "resume-extraction-request-failed",
          typeof body.errorCode === "string",
        );
      }
      if (!response.ok) throw new Error("resume-extraction-request-failed");
      if (body.status === "succeeded") return;
    }
    throw new Error("resume-extraction-request-failed");
  }

  async function submitExtraction(
    savedAsset: UploadResult,
    ocrText?: string,
  ): Promise<ExtractionOutcome> {
    const response = await request(
      `/api/source-assets/${savedAsset.id}/extract`,
      ocrText === undefined
        ? { method: "POST" }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ocrText }),
          },
    );
    const body = await responseBody(response);
    if (
      response.status === 403 &&
      body.error === "ai-processing-consent-required"
    ) {
      return "consent";
    }
    if (body.status === "failed") {
      throw new ExtractionFailure(
        typeof body.errorCode === "string"
          ? body.errorCode
          : typeof body.error === "string"
            ? body.error
            : "resume-extraction-request-failed",
        typeof body.errorCode === "string",
      );
    }
    if (!response.ok || typeof body.status !== "string") {
      throw new Error(
        typeof body.error === "string"
          ? body.error
          : "resume-extraction-request-failed",
      );
    }
    if (body.status !== "succeeded") {
      if (typeof body.jobId !== "string") {
        throw new Error("resume-extraction-request-failed");
      }
      await pollJob(body.jobId);
    }
    return "succeeded";
  }

  function showConsent() {
    setPhase("consent");
    setError(
      "文件已保存在你的私有空间。授权 AI 文字分析后可继续，不需要重新上传。",
    );
  }

  async function runOcrAndSubmit(savedAsset: UploadResult, file: File) {
    const cachedText = cachedOcrTextRef.current;
    if (cachedText !== null) {
      return submitExtraction(savedAsset, cachedText);
    }

    const controller = new AbortController();
    ocrAbortControllerRef.current = controller;
    setPhase("ocr");
    setOcrProgress(null);
    try {
      const ocrText = await ocrPdf(file, {
        signal: controller.signal,
        onProgress: (progress) => setOcrProgress(progress),
      });
      if (controller.signal.aborted) {
        const aborted = new Error("AbortError");
        aborted.name = "AbortError";
        throw aborted;
      }
      cachedOcrTextRef.current = ocrText;
      return await submitExtraction(savedAsset, ocrText);
    } finally {
      if (ocrAbortControllerRef.current === controller) {
        ocrAbortControllerRef.current = null;
      }
    }
  }

  async function extract(
    savedAsset: UploadResult,
    file = selectedFileRef.current,
  ) {
    setPhase("extracting");
    setError(null);
    setOcrProgress(null);
    try {
      await beforeExtract?.();
      const cachedText = cachedOcrTextRef.current;
      if (cachedText !== null) {
        const outcome = await submitExtraction(savedAsset, cachedText);
        if (outcome === "consent") showConsent();
        else {
          setPhase("succeeded");
          onExtractionComplete?.();
        }
        return;
      }
      let outcome: ExtractionOutcome;
      try {
        outcome = await submitExtraction(savedAsset);
      } catch (caught) {
        if (
          caught instanceof ExtractionFailure &&
          caught.hasErrorCode &&
          caught.message === "resume-text-too-short" &&
          file !== null &&
          isPdf(file)
        ) {
          outcome = await runOcrAndSubmit(savedAsset, file);
        } else {
          throw caught;
        }
      }
      if (outcome === "consent") {
        showConsent();
      } else {
        setPhase("succeeded");
        onExtractionComplete?.();
      }
    } catch (caught) {
      const code = errorCode(caught);
      setPhase("failed");
      setError(errorCopy[code] ?? "分析暂时没有完成，请重新尝试。");
    }
  }

  function cancelOcr() {
    ocrAbortControllerRef.current?.abort();
    setPhase("failed");
    setOcrProgress(null);
    setError(errorCopy.AbortError);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError(errorCopy["missing-file"]);
      return;
    }

    selectedFileRef.current = file;
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
      await extract(savedAsset, file);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setPhase("failed");
      setError(errorCopy[code] ?? "上传失败，请稍后重试。");
    }
  }

  const busy = phase === "uploading" || phase === "extracting" || phase === "ocr";

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
            {phase === "uploading"
              ? "正在安全上传…"
              : phase === "ocr"
                ? ocrProgress?.phase === "loading-model"
                  ? "正在加载本地识别模型…"
                  : ocrProgress?.phase === "recognizing"
                    ? `正在本地识别扫描版简历（第 ${ocrProgress.page}/${ocrProgress.totalPages} 页）`
                    : "正在准备本地识别…"
                : "正在分析，离开页面也不会丢失任务…"}
          </p>
          <progress
            className="mt-2 h-2 w-full accent-[var(--coral)]"
            max={ocrProgress?.phase === "recognizing" ? ocrProgress.totalPages : 1}
            value={ocrProgress?.phase === "recognizing" ? ocrProgress.page : 0}
          />
          {phase === "ocr" ? (
            <button
              type="button"
              className="button-secondary mt-3 min-h-10 px-4 text-sm font-black"
              onClick={cancelOcr}
            >
              取消本地识别
            </button>
          ) : null}
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
