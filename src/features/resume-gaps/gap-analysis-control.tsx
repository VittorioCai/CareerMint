"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";

import type { OcrProgress, ScannedPdfOcrOptions } from "@/features/source-assets/ocr";

import type { ResumeAssetOption } from "./baseline-selector";

type GapRunStatus = "queued" | "running" | "succeeded" | "failed";

export type GapRunSummary = {
  status: GapRunStatus;
  errorCode?: string | null;
};

export type GapAnalysisControlProps = {
  applicationId: string;
  asset: ResumeAssetOption;
  initialRun: GapRunSummary | null;
  request?: typeof fetch;
  refresh?: () => void;
  ocrPdf?: (file: File, options?: ScannedPdfOcrOptions) => Promise<string>;
};

const errorCopy: Record<string, string> = {
  "resume-text-too-short": "分析没有完成：简历文字太少。可以重试，或在本机识别扫描版 PDF。",
  "resume-text-too-long": "分析没有完成：简历文字超过限制，请换一份精简文件。",
  "resume-gap-parse-failed": "分析没有完成：文件解析失败，请重试或更换文件。",
  "jd-analysis-required": "请先完成 JD 分析，再判断简历差距。",
  "resume-source-required": "请先选择一份对照简历，或更换当前简历后重试。",
  "unsupported-content-type": "分析没有完成：只支持 PDF 或 DOCX 简历。",
  "rate-limited": "分析请求过于频繁，请稍后重试。",
  "ai-rate-limited": "分析请求过于频繁，请稍后重试。",
  "too-many-requests": "分析请求过于频繁，请稍后重试。",
  timeout: "分析超时，请稍后重试。",
  "ai-timeout": "分析超时，请稍后重试。",
  "resume-gap-invalid-output": "分析结果格式无效，请重试。",
  unauthorized: "登录状态已失效，请重新登录后重试。",
  "authentication-required": "登录状态已失效，请重新登录后重试。",
  "ai-provider-authentication-failed": "分析服务认证失败，请稍后重试。",
  "ai-processing-consent-required": "需要先允许 AI 处理这份简历，授权后再试。",
  "ocr-request-too-large": "识别文字超过大小限制，请精简后重试。",
  "resume-ocr-too-many-pages": "扫描版简历页数超过 10 页，请精简后重试。",
  "resume-ocr-unavailable": "本地识别暂时不可用，请重试或上传文字版简历。",
  "download-failed": "无法下载这份私有简历，请重试或更换文件。",
  "network-error": "网络暂时不可用，请重试。",
};

const defaultOcrPdf = async (file: File, options?: ScannedPdfOcrOptions) => {
  const { extractScannedPdfText } = await import("@/features/source-assets/ocr");
  return extractScannedPdfText(file, options);
};

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "";
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return Object.prototype.hasOwnProperty.call(errorCopy, message) ? message : "network-error";
}

function isPdf(asset: ResumeAssetOption) {
  return asset.contentType === "application/pdf" || asset.originalName.toLowerCase().endsWith(".pdf");
}

export function GapAnalysisControl({
  applicationId,
  asset,
  initialRun,
  request = fetch,
  refresh,
  ocrPdf = defaultOcrPdf,
}: GapAnalysisControlProps) {
  const router = useRouter();
  const refreshPage = refresh ?? router.refresh;
  const [phase, setPhase] = useState<"idle" | "analyzing" | "ocr" | "succeeded" | "failed">("idle");
  const [error, setError] = useState<string | null>(initialRun?.errorCode ?? null);
  const [runStatus, setRunStatus] = useState<GapRunStatus | null>(initialRun?.status ?? null);
  const [reused, setReused] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const cachedOcrTextRef = useRef<string | null>(null);
  const ocrAbortControllerRef = useRef<AbortController | null>(null);
  // The page keys this control by asset + JD run so browser OCR state cannot
  // cross-contaminate when a baseline is replaced.

  const busy = phase === "analyzing" || phase === "ocr";
  const canRecoverWithOcr = isPdf(asset) && error === "resume-text-too-short";
  const existingTask = runStatus === "queued" || runStatus === "running";

  async function submit(ocrText?: string) {
    setPhase("analyzing");
    setError(null);
    setRunStatus("running");
    try {
      const response = await request(
        `/api/applications/${applicationId}/resume/gaps/analyze`,
        ocrText === undefined
          ? { method: "POST" }
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ocrText }),
            },
      );
      const body = await responseBody(response);
      const status = typeof body.status === "string" ? body.status : null;
      const returnedError = typeof body.errorCode === "string"
        ? body.errorCode
        : typeof body.error === "string"
          ? body.error
          : null;
      if (!response.ok && !status) throw new Error(returnedError ?? "network-error");
      if (status === "failed") {
        setPhase("failed");
        setRunStatus("failed");
        setError(returnedError ?? "network-error");
        return;
      }
      if (status === "queued" || status === "running") {
        setPhase("analyzing");
        setRunStatus(status);
        return;
      }
      if (status !== "succeeded") throw new Error(returnedError ?? "network-error");
      setPhase("succeeded");
      setRunStatus("succeeded");
      setReused(body.reused === true);
      refreshPage();
    } catch (caught) {
      setPhase("failed");
      setRunStatus("failed");
      setError(errorCode(caught));
    }
  }

  async function analyze() {
    const cached = cachedOcrTextRef.current;
    await submit(cached ?? undefined);
  }

  async function runOcr() {
    const cached = cachedOcrTextRef.current;
    if (cached !== null) {
      await submit(cached);
      return;
    }

    const controller = new AbortController();
    ocrAbortControllerRef.current = controller;
    setPhase("ocr");
    setError(null);
    setOcrProgress(null);
    try {
      const response = await request(`/api/source-assets/${asset.id}/download`, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("download-failed");
      const blob = await response.blob();
      const file = new File([blob], asset.originalName, { type: asset.contentType });
      const text = await ocrPdf(file, {
        signal: controller.signal,
        onProgress: (progress) => setOcrProgress(progress),
      });
      if (controller.signal.aborted) {
        const aborted = new Error("AbortError");
        aborted.name = "AbortError";
        throw aborted;
      }
      cachedOcrTextRef.current = text;
      await submit(text);
    } catch (caught) {
      setPhase("failed");
      if (errorName(caught) === "AbortError" || controller.signal.aborted) {
        setError("AbortError");
      } else {
        setError(errorCode(caught));
      }
    } finally {
      if (ocrAbortControllerRef.current === controller) ocrAbortControllerRef.current = null;
    }
  }

  function cancelOcr() {
    ocrAbortControllerRef.current?.abort();
    setPhase("failed");
    setError("AbortError");
    setOcrProgress(null);
  }

  const visibleError = error
    ? errorCopy[error] ?? (error === "AbortError" ? "已取消本地识别，可重新尝试。" : "分析没有完成，请重试。")
    : null;

  return (
    <section className="dense-surface min-w-0 p-5 sm:p-6" aria-labelledby="gap-analysis-title" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">Resume comparison</p>
          <h2 id="gap-analysis-title" className="heading-font mt-1 text-2xl font-black">简历差距分析</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--ink-muted)]">
            只比较这份私有简历与已完成的 JD 分析，不会改写简历或写入职业档案。
          </p>
        </div>
        {runStatus === "succeeded" && !busy ? (
          <span className="status-chip bg-[var(--mint)]">✓ 已完成</span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="button-primary min-h-11 px-5 text-sm font-black" onClick={() => void analyze()} disabled={busy || existingTask}>
          {phase === "succeeded" || initialRun?.status === "succeeded" ? "重新分析简历差距" : "分析简历差距"}
        </button>
        {reused ? <span className="text-sm font-bold text-[var(--ink-muted)]">已复用相同简历与 JD 的缓存结果。</span> : null}
      </div>

      {busy && phase === "analyzing" ? (
        <p className="mt-4 text-sm font-black" aria-live="polite">正在分析，离开页面也不会丢失任务…</p>
      ) : null}
      {!busy && existingTask ? (
        <p className="mt-4 text-sm font-black" aria-live="polite">分析任务正在进行中，离开页面也不会丢失任务…</p>
      ) : null}
      {phase === "ocr" ? (
        <div className="mt-4" aria-live="polite">
          <p className="text-sm font-black">
            {ocrProgress?.phase === "recognizing"
              ? `正在本地识别扫描版简历（第 ${ocrProgress.page}/${ocrProgress.totalPages} 页）`
              : "正在准备本地识别…"}
          </p>
          <progress
            aria-label="扫描版 PDF 本地识别进度"
            className="mt-2 h-2 w-full accent-[var(--coral)]"
            max={ocrProgress?.phase === "recognizing" ? ocrProgress.totalPages : 1}
            value={ocrProgress?.phase === "recognizing" ? ocrProgress.page : 0}
          />
          <button type="button" className="button-secondary mt-3 min-h-11 px-4 text-sm font-black" onClick={cancelOcr}>
            取消本机识别
          </button>
        </div>
      ) : null}
      {visibleError ? <p role="alert" className="mt-4 text-sm font-bold text-[var(--error)]">{visibleError}{error === "ai-processing-consent-required" ? <> {" "}<Link href="/settings/account" className="underline underline-offset-4">前往账户设置</Link></> : null}{error === "jd-analysis-required" ? <> {" "}<Link href={`/applications/${applicationId}?tab=jd`} className="underline underline-offset-4">返回 JD 分析</Link></> : null}</p> : null}
      {canRecoverWithOcr && phase !== "ocr" ? (
        <button type="button" className="button-secondary mt-3 min-h-11 px-4 text-sm font-black" onClick={() => void runOcr()} disabled={busy}>
          在本机识别扫描版 PDF
        </button>
      ) : null}
      {phase === "failed" && !canRecoverWithOcr ? (
        <button type="button" className="button-secondary mt-3 min-h-11 px-4 text-sm font-black" onClick={() => void analyze()} disabled={busy}>
          重试分析
        </button>
      ) : null}
    </section>
  );
}
