"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { OcrProgress, ScannedPdfOcrOptions } from "@/features/source-assets/ocr";
import type { ResumeAssetOption } from "@/features/resume-gaps/baseline-selector";

type BrowserOcrHook = (
  file: File,
  options?: ScannedPdfOcrOptions,
) => Promise<string>;

declare global {
  var __JOB_BUDDY_E2E_OCR__: BrowserOcrHook | undefined;
}

type RunStatus = "queued" | "running" | "succeeded" | "failed";
type AnalysisPhase = "structure" | "comparison" | "complete";

export type JDGapControlRun = {
  status: RunStatus;
  phase: AnalysisPhase;
  errorCode: string | null;
};

type AdvanceResponse = {
  status?: unknown;
  phase?: unknown;
  nextPhase?: unknown;
  reused?: unknown;
  errorCode?: unknown;
  error?: unknown;
};

export type JDGapAnalysisControlProps = {
  applicationId: string;
  asset: ResumeAssetOption | null;
  initialRun: JDGapControlRun | null;
  runKey?: string | null;
  request?: typeof fetch;
  refresh?: () => void;
  ocrPdf?: (file: File, options?: ScannedPdfOcrOptions) => Promise<string>;
};

const errorCopy: Record<string, string> = {
  "resume-text-too-short": "没有读到足够的简历文字。若这是扫描版 PDF，可以在本机识别后重试。",
  "resume-text-too-long": "简历文字超过分析限制，请选择更精简的版本。",
  "source-download-failed": "无法下载这份私有简历，请重试或更换文件。",
  "unsupported-content-type": "目前只支持 PDF 或 DOCX 简历。",
  "ai-processing-consent-required": "需要先允许 AI 处理 JD 与简历，授权后再试。",
  "jd-gap-unavailable": "分析服务暂时不可用，请稍后重试。",
  "jd-gap-invalid-output": "分析结果格式无效，请重新分析。",
  "jd-gap-failed": "分析失败，请重新尝试。",
  "jd-gap-request-failed": "分析请求失败，请稍后重试。",
  "resume-source-changed": "对照简历已更换，请刷新页面后重试。",
  "resume-source-required": "请先选择一份对照简历。",
  "ai-provider-rate-limited": "分析请求过于频繁，请稍后重试。",
  "ai-provider-request-failed": "分析服务请求失败，请稍后重试。",
  "ai-provider-timeout": "分析服务请求超时，请稍后重试。",
  "ocr-request-too-large": "识别文字超过大小限制，请换一份更精简的简历。",
  "resume-ocr-too-many-pages": "扫描版简历超过 10 页，请精简后重试。",
  "resume-ocr-unavailable": "本地识别暂时不可用，请重试或上传文字版简历。",
  "download-failed": "无法下载这份私有简历，请重试或更换文件。",
  "network-error": "网络暂时不可用，请重试。",
};

export function resolveBrowserOcrHook(
  environment: string | undefined = process.env.NODE_ENV,
  candidate: BrowserOcrHook | undefined = globalThis.__JOB_BUDDY_E2E_OCR__,
) {
  return environment !== "production" && typeof candidate === "function"
    ? candidate
    : null;
}

async function defaultOcrPdf(file: File, options?: ScannedPdfOcrOptions) {
  const injected = resolveBrowserOcrHook();
  if (injected) return injected(file, options);
  const { extractScannedPdfText } = await import("@/features/source-assets/ocr");
  return extractScannedPdfText(file, options);
}

async function responseBody(response: Response): Promise<AdvanceResponse> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? value as AdvanceResponse : {};
  } catch {
    return {};
  }
}

function returnedError(body: AdvanceResponse) {
  return typeof body.errorCode === "string"
    ? body.errorCode
    : typeof body.error === "string"
      ? body.error
      : null;
}

function errorCode(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return Object.prototype.hasOwnProperty.call(errorCopy, code)
    ? code
    : "network-error";
}

function isPdf(asset: ResumeAssetOption | null) {
  return Boolean(
    asset && (
      asset.contentType === "application/pdf" ||
      asset.originalName.toLowerCase().endsWith(".pdf")
    ),
  );
}

function phaseCopy(phase: AnalysisPhase, status: RunStatus | null) {
  if (status === "succeeded" && phase === "complete") return "分析完成";
  if (phase === "comparison") return "正在核对简历证据";
  return "正在拆解 JD";
}

export function JDGapAnalysisControl(props: JDGapAnalysisControlProps) {
  const identity = [
    props.asset?.id ?? "none",
    props.runKey ?? "none",
    props.initialRun?.status ?? "none",
    props.initialRun?.phase ?? "none",
    props.initialRun?.errorCode ?? "none",
  ].join(":");
  return <JDGapAnalysisControlState key={identity} {...props} />;
}

function JDGapAnalysisControlState({
  applicationId,
  asset,
  initialRun,
  request = fetch,
  refresh,
  ocrPdf = defaultOcrPdf,
}: JDGapAnalysisControlProps) {
  const router = useRouter();
  const refreshPage = refresh ?? router.refresh;
  const [phase, setPhase] = useState<AnalysisPhase>(initialRun?.phase ?? "structure");
  const [status, setStatus] = useState<RunStatus | null>(initialRun?.status ?? null);
  const [error, setError] = useState<string | null>(initialRun?.errorCode ?? null);
  const [reused, setReused] = useState(false);
  const [ocrActive, setOcrActive] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const cachedOcrTextRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const busy = ocrActive || status === "queued" || status === "running";
  const completed = status === "succeeded" && phase === "complete";
  const canUseOcr = isPdf(asset) && error === "resume-text-too-short";

  async function advance(ocrText?: string, signal?: AbortSignal) {
    if (!asset) return;
    setStatus("running");
    setPhase("structure");
    setError(null);
    setReused(false);

    try {
      for (let step = 0; step < 2; step += 1) {
        const response = await request(
          `/api/applications/${applicationId}/jd-gap/analyze`,
          ocrText === undefined
            ? {
                method: "POST",
                headers: { "x-resume-source-asset-id": asset.id },
                signal,
              }
            : {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-resume-source-asset-id": asset.id,
                },
                body: JSON.stringify({ ocrText }),
                signal,
              },
        );
        const body = await responseBody(response);
        const code = returnedError(body);
        if (!response.ok && typeof body.status !== "string") {
          throw new Error(code ?? "network-error");
        }
        if (body.status === "failed") {
          setStatus("failed");
          setPhase(body.phase === "structure" ? "structure" : "comparison");
          setError(code ?? "jd-gap-failed");
          return;
        }
        if (body.status === "queued" || body.status === "running") {
          setStatus(body.status);
          setPhase(body.phase === "comparison" ? "comparison" : "structure");
          return;
        }
        if (body.status !== "succeeded") {
          throw new Error(code ?? "jd-gap-request-failed");
        }
        if (body.phase === "complete" && body.nextPhase == null) {
          setStatus("succeeded");
          setPhase("complete");
          setReused(body.reused === true);
          refreshPage();
          return;
        }
        if (body.phase === "structure" && body.nextPhase === "comparison" && step === 0) {
          setPhase("comparison");
          continue;
        }
        throw new Error("jd-gap-incomplete");
      }
    } catch (caught) {
      if (!mountedRef.current || signal?.aborted) return;
      setStatus("failed");
      setError(
        caught instanceof Error && caught.message === "jd-gap-incomplete"
          ? "jd-gap-incomplete"
          : errorCode(caught),
      );
    }
  }

  async function runOcr() {
    if (!asset) return;
    if (cachedOcrTextRef.current !== null) {
      await advance(cachedOcrTextRef.current);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setOcrActive(true);
    setOcrProgress(null);
    setError(null);
    try {
      const response = await request(`/api/source-assets/${asset.id}/download`, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("download-failed");
      const file = new File([await response.blob()], asset.originalName, {
        type: asset.contentType,
      });
      const text = await ocrPdf(file, {
        signal: controller.signal,
        onProgress: setOcrProgress,
      });
      if (controller.signal.aborted) return;
      cachedOcrTextRef.current = text;
      setOcrActive(false);
      await advance(text, controller.signal);
    } catch (caught) {
      if (!mountedRef.current) return;
      setOcrActive(false);
      setStatus("failed");
      setError(
        controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")
          ? "AbortError"
          : errorCode(caught),
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function cancelOcr() {
    abortRef.current?.abort();
    abortRef.current = null;
    setOcrActive(false);
    setOcrProgress(null);
    setStatus("failed");
    setError("AbortError");
  }

  const visibleError = error === "AbortError"
    ? "已取消本地识别，可以重新尝试。"
    : error === "jd-gap-incomplete"
      ? "分析尚未完成，请重新尝试。"
      : error
        ? errorCopy[error] ?? "分析没有完成，请重新尝试。"
        : null;

  return (
    <section
      className="dense-surface min-w-0 p-5 sm:p-6"
      aria-labelledby="jd-gap-control-title"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Evidence review
          </p>
          <h2 id="jd-gap-control-title" className="heading-font mt-1 text-2xl font-black">
            开始核对
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--ink-muted)]">
            先拆解岗位条件，再逐项核对所选简历和已确认职业事实。分析不会改写简历。
          </p>
        </div>
        {status ? (
          <span className={`status-chip ${completed ? "bg-[var(--mint)]" : "bg-[var(--mist-blue)]"}`}>
            {status === "failed" ? "! 未完成" : completed ? "✓ 已完成" : "◷ 处理中"}
          </span>
        ) : null}
      </div>

      {asset ? (
        <p className="mt-4 text-sm font-bold text-[var(--ink-muted)]">
          对照简历：<span className="break-words text-[var(--ink)]">{asset.originalName}</span>
        </p>
      ) : (
        <p className="mt-4 text-sm font-bold text-[var(--error)]">
          尚未选择对照简历。{" "}
          <Link className="underline underline-offset-4" href={`/applications/${applicationId}?tab=resume`}>
            先选择对照简历
          </Link>
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="button-primary min-h-11 px-5 text-sm font-black"
          disabled={!asset || busy}
          onClick={() => void advance(cachedOcrTextRef.current ?? undefined)}
        >
          {completed ? "重新分析 JD 差距" : "开始 JD 差距分析"}
        </button>
        {reused ? (
          <span className="text-sm font-bold text-[var(--ink-muted)]">
            已复用相同材料的分析结果，没有重复调用模型。
          </span>
        ) : null}
      </div>

      {busy && !ocrActive ? (
        <p className="mt-4 text-sm font-black" aria-live="polite">
          {phaseCopy(phase, status)}
        </p>
      ) : null}
      {!busy && completed ? (
        <p className="mt-4 text-sm font-black text-[var(--mint-strong)]" aria-live="polite">
          分析完成
        </p>
      ) : null}
      {ocrActive ? (
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
          <button
            type="button"
            className="button-secondary mt-3 min-h-11 px-4 text-sm font-black"
            onClick={cancelOcr}
          >
            取消本机识别
          </button>
        </div>
      ) : null}
      {visibleError ? (
        <p role="alert" className="mt-4 text-sm font-bold text-[var(--error)]">
          {visibleError}
          {error === "ai-processing-consent-required" ? (
            <> {" "}<Link href="/settings/account" className="underline underline-offset-4">前往账户设置</Link></>
          ) : null}
        </p>
      ) : null}
      {canUseOcr && !ocrActive ? (
        <button
          type="button"
          className="button-secondary mt-3 min-h-11 px-4 text-sm font-black"
          onClick={() => void runOcr()}
        >
          在本机识别扫描版 PDF
        </button>
      ) : null}
      {status === "failed" && !canUseOcr && !ocrActive ? (
        <button
          type="button"
          className="button-secondary mt-3 min-h-11 px-4 text-sm font-black"
          onClick={() => void advance(cachedOcrTextRef.current ?? undefined)}
          disabled={!asset}
        >
          重试分析
        </button>
      ) : null}
    </section>
  );
}
