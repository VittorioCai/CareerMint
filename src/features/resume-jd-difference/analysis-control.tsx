"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { ResumeAssetOption } from "@/features/resume-gaps/baseline-selector";
import type {
  OcrProgress,
  ScannedPdfOcrOptions,
} from "@/features/source-assets/ocr";

export type DifferenceBrowserOcrHook = (
  file: File,
  options?: ScannedPdfOcrOptions,
) => Promise<string>;

// Mirrors normalizeResumeText on the server, so a paste that would be rejected
// there is refused here instead of costing a round trip.
const MIN_PASTED_RESUME_CHARS = 40;
const MAX_PASTED_RESUME_CHARS = 100_000;

declare global {
  var __JOB_BUDDY_E2E_OCR__: DifferenceBrowserOcrHook | undefined;
}

type RunStatus = "queued" | "running" | "succeeded" | "failed";
type Freshness = "current" | "stale" | "missing";

export type ResumeJDDifferenceControlRun = {
  status: RunStatus;
  errorCode: string | null;
};

type AnalyzeResponse = {
  status?: unknown;
  reused?: unknown;
  freshness?: unknown;
  errorCode?: unknown;
  error?: unknown;
};

export type ResumeJDDifferenceAnalysisControlProps = {
  applicationId: string;
  asset: ResumeAssetOption | null;
  initialRun: ResumeJDDifferenceControlRun | null;
  freshness: Freshness;
  hasPreviousResult?: boolean;
  request?: typeof fetch;
  refresh?: () => void;
  ocrPdf?: DifferenceBrowserOcrHook;
};

const errorCopy: Record<string, string> = {
  "ai-processing-consent-required":
    "需要先允许 AI 处理 JD 与简历，授权后再试。",
  "resume-source-required": "请先选择一份对照简历。",
  "resume-source-changed": "对照简历已经变化，请刷新页面后重试。",
  "resume-text-insufficient":
    "没有读到足够的简历文字。请回到简历页预览，必要时重新上传。",
  "resume-parse-failed":
    "无法读取这份简历。请回到简历页检查预览或重新上传。",
  "source-download-failed": "无法下载这份私有简历，请稍后重试。",
  "resume-jd-difference-unavailable": "分析服务尚未配置或暂时不可用。",
  "resume-jd-difference-invalid-output":
    "分析结果没有通过完整性检查，请重新分析。",
  "resume-jd-difference-evidence-invalid":
    "分析中的引用无法回查，因此结果没有发布。请重新分析。",
  "ai-timeout": "分析服务响应超时，请稍后重新分析。",
  "ai-rate-limited": "分析请求较多，请稍后再试。",
  "ai-request-failed": "分析服务请求失败，请稍后再试。",
  "resume-jd-difference-request-failed": "分析请求失败，请稍后重试。",
  "resume-jd-difference-failed": "分析没有完成，请重新尝试。",
  "resume-ocr-too-many-pages": "扫描版简历页数超过 10 页，请精简后重试。",
  "resume-ocr-unavailable": "本地识别暂时不可用，请重试或上传文字版简历。",
  "ocr-request-too-large": "识别文字超过大小限制，请精简后重试。",
  "invalid-ocr-text": "识别文字无效，请重新识别或上传文字版简历。",
  "download-failed": "无法下载这份私有简历，请重试。",
  "network-error": "网络暂时不可用，请检查连接后重试。",
};

export function resolveDifferenceBrowserOcrHook(
  environment: string | undefined = process.env.NODE_ENV,
  candidate: DifferenceBrowserOcrHook | undefined =
    globalThis.__JOB_BUDDY_E2E_OCR__,
) {
  return environment !== "production" && typeof candidate === "function"
    ? candidate
    : null;
}

const defaultOcrPdf: DifferenceBrowserOcrHook = async (file, options) => {
  const injected = resolveDifferenceBrowserOcrHook();
  if (injected) return injected(file, options);
  const { extractScannedPdfText } = await import("@/features/source-assets/ocr");
  return extractScannedPdfText(file, options);
};

async function responseBody(response: Response): Promise<AnalyzeResponse> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object"
      ? (value as AnalyzeResponse)
      : {};
  } catch {
    return {};
  }
}

function returnedError(body: AnalyzeResponse) {
  return typeof body.errorCode === "string"
    ? body.errorCode
    : typeof body.error === "string"
      ? body.error
      : null;
}

export function ResumeJDDifferenceAnalysisControl(
  props: ResumeJDDifferenceAnalysisControlProps,
) {
  const identity = [
    props.asset?.id ?? "none",
    props.initialRun?.status ?? "none",
    props.initialRun?.errorCode ?? "none",
    props.freshness,
  ].join(":");
  return <AnalysisControlState key={identity} {...props} />;
}

function AnalysisControlState({
  applicationId,
  asset,
  initialRun,
  freshness,
  hasPreviousResult = false,
  request = fetch,
  refresh,
  ocrPdf = defaultOcrPdf,
}: ResumeJDDifferenceAnalysisControlProps) {
  const router = useRouter();
  const refreshPage = refresh ?? router.refresh;
  const initialStatus =
    freshness === "stale" ? "stale" : initialRun?.status ?? "idle";
  const [status, setStatus] = useState<
    "idle" | "submitting" | RunStatus | "stale"
  >(initialStatus);
  const [error, setError] = useState<string | null>(
    initialRun?.status === "failed" ? initialRun.errorCode : null,
  );
  const [reused, setReused] = useState(false);
  const [ocrActive, setOcrActive] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const cachedOcrTextRef = useRef<string | null>(null);
  const ocrAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      ocrAbortControllerRef.current?.abort();
      ocrAbortControllerRef.current = null;
    },
    [],
  );

  if (!asset) {
    return (
      <section className="dense-surface overflow-hidden" aria-labelledby="difference-control-title">
        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Resume baseline
            </p>
            <h2 id="difference-control-title" className="heading-font mt-1 text-2xl font-black">
              先确定这次要对照的简历
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--ink-muted)]">
              差异分析只比较当前 JD 与你选定的那一版简历，职业档案仅作为已确认补充。
            </p>
          </div>
          <Link
            href={`/applications/${applicationId}?tab=resume`}
            className="button-primary inline-flex min-h-11 items-center justify-center px-5 text-sm font-black"
          >
            先选择对照简历
          </Link>
        </div>
      </section>
    );
  }
  const selectedAsset = asset;

  const busy =
    ocrActive ||
    status === "submitting" ||
    status === "queued" ||
    status === "running";
  const completed = status === "succeeded";
  const stale = status === "stale";
  // Once the paste box is open the upload error is stale advice — it tells the
  // user to go back and re-upload, which is the opposite of what they are doing.
  const visibleError =
    error && !pasteOpen ? errorCopy[error] ?? "分析没有完成，请重新尝试。" : null;

  const canPasteText =
    error === "resume-text-insufficient" || error === "resume-parse-failed";

  const canRecoverWithOcr =
    (asset.contentType === "application/pdf" ||
      asset.originalName.toLowerCase().endsWith(".pdf")) &&
    error === "resume-text-insufficient";

  async function analyze(
    ocrText?: string,
    signal?: AbortSignal,
    continueFromOcr = false,
  ) {
    if (busy && !continueFromOcr) return;
    setStatus("submitting");
    setError(null);
    setReused(false);
    try {
      const init: RequestInit =
        ocrText === undefined
          ? {
              method: "POST",
              headers: { "x-resume-source-asset-id": selectedAsset.id },
            }
          : {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-resume-source-asset-id": selectedAsset.id,
              },
              body: JSON.stringify({ ocrText }),
            };
      if (signal) init.signal = signal;
      const response = await request(
        `/api/applications/${applicationId}/resume-jd-difference/analyze`,
        init,
      );
      const body = await responseBody(response);
      const code = returnedError(body);
      if (!response.ok && typeof body.status !== "string") {
        throw new Error(code ?? "network-error");
      }
      if (body.status === "queued" || body.status === "running") {
        setStatus(body.status);
        return;
      }
      if (body.status === "failed") {
        setStatus("failed");
        setError(code ?? "resume-jd-difference-failed");
        return;
      }
      if (body.status !== "succeeded") {
        throw new Error(code ?? "resume-jd-difference-request-failed");
      }
      setStatus("succeeded");
      setReused(body.reused === true);
      refreshPage();
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "network-error";
      setStatus("failed");
      setError(
        Object.prototype.hasOwnProperty.call(errorCopy, code)
          ? code
          : "network-error",
      );
    }
  }

  async function runOcr() {
    if (busy) return;
    const cached = cachedOcrTextRef.current;
    if (cached !== null) {
      await analyze(cached);
      return;
    }
    const controller = new AbortController();
    ocrAbortControllerRef.current = controller;
    setOcrActive(true);
    setError(null);
    setOcrProgress(null);
    try {
      const response = await request(
        `/api/source-assets/${selectedAsset.id}/download`,
        { method: "GET", signal: controller.signal },
      );
      if (!response.ok) throw new Error("download-failed");
      const file = new File([await response.blob()], selectedAsset.originalName, {
        type: selectedAsset.contentType,
      });
      const text = await ocrPdf(file, {
        signal: controller.signal,
        onProgress: setOcrProgress,
      });
      if (controller.signal.aborted) {
        throw new DOMException("The OCR operation was aborted.", "AbortError");
      }
      cachedOcrTextRef.current = text;
      await analyze(text, controller.signal, true);
    } catch (caught) {
      const code =
        caught instanceof Error && caught.name === "AbortError"
          ? "AbortError"
          : caught instanceof Error &&
              Object.prototype.hasOwnProperty.call(errorCopy, caught.message)
            ? caught.message
            : "resume-ocr-unavailable";
      setStatus("failed");
      setError(code === "AbortError" ? "resume-ocr-unavailable" : code);
    } finally {
      setOcrActive(false);
      setOcrProgress(null);
      if (ocrAbortControllerRef.current === controller) {
        ocrAbortControllerRef.current = null;
      }
    }
  }

  function cancelOcr() {
    ocrAbortControllerRef.current?.abort();
  }

  const statusCopy = ocrActive
    ? "正在本机识别扫描版简历"
    : busy
      ? "正在分析岗位与简历差异"
    : stale
      ? "材料已变化，请重新分析"
      : completed
        ? "分析已完成"
        : status === "failed"
          ? "本次分析没有完成"
          : "准备分析当前 JD 与这份简历";

  return (
    <section
      className="sticker-border overflow-hidden bg-[var(--mist-blue)] shadow-[5px_5px_0_var(--ink)]"
      aria-labelledby="difference-control-title"
      aria-busy={busy}
    >
      <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="status-chip bg-white">
              {completed ? "✓" : stale ? "!" : busy ? "◌" : "→"} {statusCopy}
            </span>
            {reused ? (
              <span className="text-xs font-black text-[var(--ink-muted)]">
                已复用相同材料的结果
              </span>
            ) : null}
          </div>
          <h2 id="difference-control-title" className="heading-font mt-3 text-2xl font-black">
            对照：{asset.originalName}
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--ink-muted)]">
            一次分析会同时生成岗位核心判断、完整差异和后续完善方向；不会修改简历。
          </p>
          {visibleError ? (
            <p role="alert" className="mt-3 text-sm font-black text-[var(--error)]">
              {visibleError}
            </p>
          ) : null}
          {canRecoverWithOcr && !ocrActive ? (
            <div className="mt-3">
              <button
                type="button"
                className="button-secondary min-h-11 px-4 text-sm font-black"
                onClick={() => void runOcr()}
                disabled={busy}
              >
                在本机识别扫描版 PDF
              </button>
              <p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-[var(--ink-muted)]">
                识别在你的浏览器里完成，简历不会上传。首次使用需要下载约 30 MB
                的识别引擎，之后浏览器会缓存，不必重复下载。
              </p>
            </div>
          ) : null}
          {canPasteText && !ocrActive ? (
            pasteOpen ? (
              <div className="mt-3">
                <label
                  htmlFor="difference-pasted-resume"
                  className="text-xs font-black uppercase tracking-[0.12em]"
                >
                  简历文字
                </label>
                <textarea
                  id="difference-pasted-resume"
                  rows={6}
                  value={pastedText}
                  onChange={(event) => setPastedText(event.target.value)}
                  placeholder="把简历内容粘贴到这里。不会上传原文件，只发送这段文字。"
                  className="mt-2 w-full rounded-xl border-2 border-[var(--ink)] bg-white p-3 text-sm font-semibold leading-6"
                />
                {pasteError ? (
                  <p role="alert" className="mt-2 text-sm font-black text-[var(--error)]">
                    {pasteError}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="button-primary min-h-11 px-4 text-sm font-black disabled:opacity-60"
                    disabled={busy}
                    onClick={() => {
                      const text = pastedText.trim();
                      if (text.length < MIN_PASTED_RESUME_CHARS) {
                        setPasteError(
                          `粘贴的文字太短，至少需要 ${MIN_PASTED_RESUME_CHARS} 个字符。`,
                        );
                        return;
                      }
                      if (text.length > MAX_PASTED_RESUME_CHARS) {
                        setPasteError(
                          "粘贴的文字超出长度上限，请只保留简历正文。",
                        );
                        return;
                      }
                      setPasteError(null);
                      void analyze(text);
                    }}
                  >
                    用这段文字分析
                  </button>
                  <button
                    type="button"
                    className="button-secondary min-h-11 px-4 text-sm font-black"
                    onClick={() => setPasteOpen(false)}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="button-secondary mt-3 min-h-11 px-4 text-sm font-black"
                onClick={() => setPasteOpen(true)}
                disabled={busy}
              >
                改为粘贴简历文字
              </button>
            )
          ) : null}
          {ocrActive ? (
            <div className="mt-3" aria-live="polite">
              <p className="text-sm font-black">
                {ocrProgress?.phase === "recognizing"
                  ? `正在本机识别扫描版简历（第 ${ocrProgress.page}/${ocrProgress.totalPages} 页）`
                  : "正在下载识别引擎（首次约 30 MB，之后会缓存）…"}
              </p>
              <progress
                aria-label={
                  ocrProgress?.phase === "recognizing"
                    ? "扫描版 PDF 本机识别进度"
                    : "识别引擎下载进度"
                }
                className="mt-2 h-2 w-full accent-[var(--coral)]"
                max={
                  ocrProgress?.phase === "recognizing"
                    ? ocrProgress.totalPages
                    : 1
                }
                value={
                  ocrProgress?.phase === "recognizing" ? ocrProgress.page : 0
                }
              />
              <button
                type="button"
                className="button-secondary mt-2 min-h-10 px-4 text-xs font-black"
                onClick={cancelOcr}
              >
                取消本机识别
              </button>
            </div>
          ) : null}
          {hasPreviousResult && (busy || status === "failed") ? (
            <Link
              href={`/applications/${applicationId}?tab=difference&result=previous`}
              className="mt-3 inline-block text-sm font-black underline decoration-2 underline-offset-4"
            >
              查看上次结果
            </Link>
          ) : null}
        </div>
        <button
          type="button"
          className="button-primary min-h-11 min-w-36 px-5 text-sm font-black disabled:cursor-wait disabled:opacity-65"
          disabled={busy}
          onClick={() => void analyze(cachedOcrTextRef.current ?? undefined)}
        >
          {ocrActive
            ? "正在识别…"
            : busy
              ? "正在分析…"
              : completed || stale
                ? "重新分析"
                : "开始差异分析"}
        </button>
      </div>
    </section>
  );
}
