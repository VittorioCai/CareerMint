"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { ResumeAssetOption } from "@/features/resume-baseline/baseline-selector";
import type { Dictionary } from "@/i18n/dictionaries/en";
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

export type DifferenceControlCopy = Dictionary["difference"]["control"];

export type ResumeJDDifferenceAnalysisControlProps = {
  applicationId: string;
  copy: DifferenceControlCopy;
  common: Dictionary["common"];
  asset: ResumeAssetOption | null;
  initialRun: ResumeJDDifferenceControlRun | null;
  freshness: Freshness;
  hasPreviousResult?: boolean;
  request?: typeof fetch;
  refresh?: () => void;
  ocrPdf?: DifferenceBrowserOcrHook;
};

/**
 * Every code the analyze route and the OCR path can fail with, in the
 * reader's language.
 *
 * A record rather than a switch because the component asks two questions of
 * it: what does this code say, and *is* this a code we know — a caught
 * `Error` message is only treated as an error code if it appears here, and
 * anything else becomes `network-error` rather than being shown raw.
 */
export function differenceErrorCopy(
  copy: DifferenceControlCopy["errors"],
): Record<string, string> {
  return {
    "ai-processing-consent-required": copy.consentRequired,
    "resume-source-required": copy.sourceRequired,
    "resume-source-changed": copy.sourceChanged,
    "resume-text-insufficient": copy.textInsufficient,
    "resume-parse-failed": copy.parseFailed,
    "source-download-failed": copy.downloadFailed,
    "resume-jd-difference-unavailable": copy.unavailable,
    "resume-jd-difference-invalid-output": copy.invalidOutput,
    "resume-jd-difference-evidence-invalid": copy.evidenceInvalid,
    "ai-timeout": copy.timeout,
    "ai-rate-limited": copy.rateLimited,
    "ai-request-failed": copy.requestFailed,
    "resume-jd-difference-request-failed": copy.analysisRequestFailed,
    "resume-jd-difference-failed": copy.failed,
    "resume-ocr-too-many-pages": copy.ocrTooManyPages,
    "resume-ocr-unavailable": copy.ocrUnavailable,
    "ocr-request-too-large": copy.ocrRequestTooLarge,
    "invalid-ocr-text": copy.invalidOcrText,
    "download-failed": copy.downloadRetry,
    "network-error": copy.networkError,
  };
}

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
  copy,
  common,
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
  const errorCopy = differenceErrorCopy(copy.errors);

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
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              {copy.baselineEyebrow}
            </p>
            <h2 id="difference-control-title" className="heading-font mt-1 text-2xl font-bold">
              {copy.baselineTitle}
            </h2>
            <p className="mt-2 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
              {copy.baselineBody}
            </p>
            {hasPreviousResult ? (
              <p className="mt-2 type-body font-medium">
                {copy.previousShown}
              </p>
            ) : null}
          </div>
          <Link
            href={`/applications/${applicationId}?tab=resume`}
            className="button-primary inline-flex min-h-11 items-center justify-center px-5 text-sm font-semibold"
          >
            {copy.chooseBaseline}
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
    error && !pasteOpen
      ? errorCopy[error] ?? errorCopy["resume-jd-difference-failed"]
      : null;

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
    ? copy.statusOcr
    : busy
      ? copy.statusAnalysing
    : stale
      ? copy.statusStale
      : completed
        ? copy.statusComplete
        : status === "failed"
          ? copy.statusFailed
          : copy.statusIdle;

  // When a result is on screen the panel's own headline already names the
  // resume and the state, so repeating them here would be the page saying the
  // same thing twice inside one sticker. Only `completed` qualifies: a stale
  // run shows no conclusion, so hiding this too would leave nothing explaining
  // why the page is empty.
  const resultOnScreen = completed;

  return (
    <div
      className="flex flex-wrap items-center justify-end gap-4"
      aria-busy={busy}
    >
        {/* Empty when a finished run needs nothing explained, and then it
            collapses so the two buttons sit together instead of being pushed
            apart by a reserved column. */}
        <div className="min-w-0 flex-1 empty:hidden">
          {resultOnScreen ? null : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="status-chip bg-[var(--paper)]">
                  {busy ? "◌" : "→"} {statusCopy}
                </span>
              </div>
              <h2 id="difference-control-title" className="heading-font mt-3 text-2xl font-bold">
                {copy.comparing.replace("{name}", asset.originalName)}
              </h2>
              <p className="mt-2 max-w-3xl type-caption font-medium text-[var(--ink-muted)]">
                {copy.oneRunBody}
              </p>
            </>
          )}
          {reused ? (
            <p className="text-xs font-semibold text-[var(--ink-muted)]">
              {copy.reused}
            </p>
          ) : null}
          {visibleError ? (
            <p role="alert" className="mt-3 text-sm font-semibold text-[var(--error)]">
              {visibleError}
            </p>
          ) : null}
          {canRecoverWithOcr && !ocrActive ? (
            <div className="mt-3">
              <button
                type="button"
                className="button-secondary min-h-11 px-4 text-sm font-semibold"
                onClick={() => void runOcr()}
                disabled={busy}
              >
                {copy.ocrCta}
              </button>
              <p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-[var(--ink-muted)]">
                {copy.ocrNote}
              </p>
            </div>
          ) : null}
          {canPasteText && !ocrActive ? (
            pasteOpen ? (
              <div className="mt-3">
                <label
                  htmlFor="difference-pasted-resume"
                  className="text-xs font-semibold uppercase tracking-[0.12em]"
                >
                  {copy.pasteLabel}
                </label>
                <textarea
                  id="difference-pasted-resume"
                  rows={6}
                  value={pastedText}
                  onChange={(event) => setPastedText(event.target.value)}
                  placeholder={copy.pastePlaceholder}
                  className="form-input mt-2 leading-6"
                />
                {pasteError ? (
                  <p role="alert" className="mt-2 text-sm font-semibold text-[var(--error)]">
                    {pasteError}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="button-primary min-h-11 px-4 text-sm font-semibold disabled:opacity-60"
                    disabled={busy}
                    onClick={() => {
                      const text = pastedText.trim();
                      if (text.length < MIN_PASTED_RESUME_CHARS) {
                        setPasteError(
                          copy.pasteTooShort.replace(
                            "{min}",
                            String(MIN_PASTED_RESUME_CHARS),
                          ),
                        );
                        return;
                      }
                      if (text.length > MAX_PASTED_RESUME_CHARS) {
                        setPasteError(copy.pasteTooLong);
                        return;
                      }
                      setPasteError(null);
                      void analyze(text);
                    }}
                  >
                    {copy.pasteAnalyse}
                  </button>
                  <button
                    type="button"
                    className="button-secondary min-h-11 px-4 text-sm font-semibold"
                    onClick={() => setPasteOpen(false)}
                  >
                    {common.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="button-secondary mt-3 min-h-11 px-4 text-sm font-semibold"
                onClick={() => setPasteOpen(true)}
                disabled={busy}
              >
                {copy.pasteOpen}
              </button>
            )
          ) : null}
          {ocrActive ? (
            <div className="mt-3" aria-live="polite">
              <p className="text-sm font-semibold">
                {ocrProgress?.phase === "recognizing"
                  ? copy.ocrProgress
                      .replace("{page}", String(ocrProgress.page))
                      .replace("{total}", String(ocrProgress.totalPages))
                  : copy.ocrDownloading}
              </p>
              <progress
                aria-label={
                  ocrProgress?.phase === "recognizing"
                    ? copy.ocrProgressLabel
                    : copy.ocrDownloadLabel
                }
                className="mt-2 h-2 w-full accent-[var(--ink)]"
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
                className="button-secondary mt-2 min-h-10 px-4 text-xs font-semibold"
                onClick={cancelOcr}
              >
                {copy.cancelOcr}
              </button>
            </div>
          ) : null}
          {hasPreviousResult && (busy || status === "failed") ? (
            <Link
              href={`/applications/${applicationId}?tab=difference&result=previous`}
              className="mt-3 inline-block text-sm font-semibold underline decoration-[var(--ink-soft)] underline-offset-4"
            >
              {copy.viewPrevious}
            </Link>
          ) : null}
        </div>
        <button
          type="button"
          className="press button-primary inline-flex min-h-10 items-center justify-center rounded-full px-5 text-sm font-semibold disabled:cursor-wait disabled:opacity-65"
          disabled={busy}
          onClick={() => void analyze(cachedOcrTextRef.current ?? undefined)}
        >
          {ocrActive
            ? copy.recognising
            : busy
              ? copy.analysing
              : completed || stale
                ? copy.reanalyse
                : copy.start}
        </button>
    </div>
  );
}
