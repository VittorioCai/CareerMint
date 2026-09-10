"use client";

import { type FormEvent, useRef, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";

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

/** Server error codes to the sentence that explains each one. */
export function uploadErrorMessage(
  code: string,
  copy: Dictionary["resume"],
  /**
   * What an unrecognised code means *here*. Uploading and picking a baseline
   * share this table because the baseline picker uploads too, but they fail
   * differently: an unknown code mid-upload means the file never arrived, and
   * an unknown code mid-selection means the choice was not saved. Collapsing
   * both into one default told half the readers the wrong thing.
   */
  fallback: string = copy.errors.uploadFallback,
): string {
  const messages: Record<string, string> = {
    "empty-file": copy.errors.emptyFile,
    "file-too-large": copy.errors.tooLarge,
    "unsupported-content-type": copy.errors.unsupportedType,
    "unsupported-file-signature": copy.errors.badSignature,
    "content-type-mismatch": copy.errors.typeMismatch,
    "missing-file": copy.errors.missingFile,
    unauthorized: copy.errors.unauthorized,
    "upload-failed": copy.errors.uploadFailed,
    "resume-extraction-request-failed": copy.errors.extractionFailed,
    "resume-text-too-short": copy.errors.textTooShort,
    "resume-ocr-too-many-pages": copy.errors.ocrTooManyPages,
    "resume-ocr-unavailable": copy.errors.ocrUnavailable,
    "ocr-request-too-large": copy.errors.ocrRequestTooLarge,
    "ai-provider-authentication-failed": copy.errors.providerAuthFailed,
    AbortError: copy.errors.cancelled,
    "invalid-input": copy.errors.invalidSelection,
    "application-or-resume-not-found": copy.errors.selectionNotFound,
    "application-storage-error": copy.errors.selectionFailed,
    "application-action-failed": copy.errors.selectionFailed,
  };
  return messages[code] ?? fallback;
}

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
  copy,
}: UploadFormProps & { copy: Dictionary["resume"] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);
  const cachedOcrTextRef = useRef<string | null>(null);
  const ocrAbortControllerRef = useRef<AbortController | null>(null);
  const [asset, setAsset] = useState<UploadResult | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "uploading" | "extracting" | "ocr" | "succeeded" | "failed" | "consent"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [chosenName, setChosenName] = useState<string | null>(null);
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
      copy.savedPrivately,
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
      setError(
        uploadErrorMessage(code, copy),
      );
    }
  }

  function cancelOcr() {
    ocrAbortControllerRef.current?.abort();
    setPhase("failed");
    setOcrProgress(null);
    setError(copy.errors.cancelled);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError(copy.errors.missingFile);
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
      setError(uploadErrorMessage(code, copy));
    }
  }

  const busy = phase === "uploading" || phase === "extracting" || phase === "ocr";

  return (
    <form
      className="min-w-0"
      onSubmit={handleSubmit}
      noValidate
    >
      <div>
        <label className="form-label" htmlFor="resume-source">
          {copy.uploadLabel}
        </label>
        <div className="form-input mt-2 flex max-w-full items-center gap-3">
          <input
            ref={inputRef}
            id="resume-source"
            name="file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="peer sr-only"
            disabled={busy || asset !== null}
            required={!asset}
            onChange={(event) =>
              setChosenName(event.target.files?.[0]?.name ?? null)
            }
          />
          <label
            htmlFor="resume-source"
            className="button-secondary inline-flex shrink-0 cursor-pointer items-center justify-center px-3 py-1.5 text-sm font-semibold peer-disabled:cursor-not-allowed peer-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]"
          >
            {copy.chooseFile}
          </label>
          <span
            className={`min-w-0 truncate text-sm ${chosenName ? "font-bold" : "font-medium text-[var(--ink-muted)]"}`}
          >
            {chosenName ?? copy.noFileChosen}
          </span>
        </div>
        <p className="mt-2 text-xs font-medium text-[var(--ink-muted)]">
          {copy.fileNote}
        </p>
      </div>

      {asset ? (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3 text-sm">
          <p className="break-words font-semibold">{copy.savedSafely.replace("{name}", asset.originalName)}</p>
          <p className="mt-1 text-xs font-medium text-[var(--ink-muted)]">
            {copy.retryNote}
          </p>
        </div>
      ) : null}

      {busy ? (
        <div className="mt-4" aria-live="polite">
          <p className="text-sm font-semibold">
            {phase === "uploading"
              ? copy.uploading
              : phase === "ocr"
                ? ocrProgress?.phase === "loading-model"
                  ? copy.loadingOcrModel
                  : ocrProgress?.phase === "recognizing"
                    ? copy.ocrProgress
                        .replace("{page}", String(ocrProgress.page))
                        .replace("{total}", String(ocrProgress.totalPages))
                    : copy.preparingOcr
                : copy.analysing}
          </p>
          <progress
            className="mt-2 h-2 w-full accent-[var(--ink)]"
            max={ocrProgress?.phase === "recognizing" ? ocrProgress.totalPages : 1}
            value={ocrProgress?.phase === "recognizing" ? ocrProgress.page : 0}
          />
          {phase === "ocr" ? (
            <button
              type="button"
              className="button-secondary mt-3 min-h-10 px-4 text-sm font-semibold"
              onClick={cancelOcr}
            >
              {copy.cancelOcr}
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === "succeeded" ? (
        <p className="mt-4 rounded-xl border border-[var(--ink)] bg-[var(--sev-matched)] p-3 text-sm font-semibold" role="status">
          <span aria-hidden="true">✓ </span>
          <span>{copy.analysisComplete}</span>
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
          className="button-primary mt-5 min-h-11 px-5 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
          disabled={busy}
        >
          {phase === "uploading" ? copy.uploadingShort : copy.uploadAndStart}
        </button>
      ) : phase === "failed" || phase === "consent" ? (
        <button
          type="button"
          className="button-primary mt-5 min-h-11 px-5 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
          disabled={busy}
          onClick={() => void extract(asset)}
        >
          {phase === "consent" ? copy.consentRetry : copy.retry}
        </button>
      ) : null}
    </form>
  );
}
