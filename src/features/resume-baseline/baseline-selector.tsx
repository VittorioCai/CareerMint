"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type MouseEvent,
  useRef,
  useState,
} from "react";

import { uploadErrorMessage } from "@/features/source-assets/upload-form";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatDay } from "@/i18n/format";
import type { AppLocale } from "@/i18n/locale";

import type { ApplicationActionState } from "@/features/applications/actions";

import type { SourceAssetStatus } from "./asset-usage";
import { ResumeFileDeleteControl } from "./resume-file-delete-control";

export type ResumeAssetOption = {
  id: string;
  originalName: string;
  contentType: string;
  createdAt: string;
};

// A row in the picker carries what the delete confirmation needs to state the
// cost up front. The selected asset stays a plain option: it is rendered as a
// summary, not a deletable row.
export type ResumeAssetRow = ResumeAssetOption & {
  status: SourceAssetStatus;
  applicationCount: number;
  confirmedFactCount: number;
};

export type BaselineSelectorProps = {
  applicationId: string;
  selectedAsset: ResumeAssetOption | null;
  availableAssets: ResumeAssetRow[];
  setupMode: boolean;
  setResumeSource(
    formData: FormData,
  ): Promise<ApplicationActionState>;
};


async function readResponse(response: Response) {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function BaselineSelector({
  applicationId,
  selectedAsset,
  availableAssets,
  setupMode,
  setResumeSource,
  copy,
  common,
  locale,
}: BaselineSelectorProps & {
  copy: Dictionary["resume"];
  common: Dictionary["common"];
  locale: AppLocale;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<ResumeAssetOption | null>(null);
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null);
  const serverStateKey = `${setupMode ? "setup" : "ready"}:${selectedAsset?.id ?? "none"}`;
  const [optionsState, setOptionsState] = useState({
    key: serverStateKey,
    open: setupMode || !selectedAsset,
  });
  const [fileState, setFileState] = useState<{
    key: string;
    file: File | null;
  }>({ key: serverStateKey, file: null });
  const inputRef = useRef<HTMLInputElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const showOptions =
    optionsState.key === serverStateKey
      ? optionsState.open
      : setupMode || !selectedAsset;
  const selectedFile = fileState.key === serverStateKey ? fileState.file : null;

  // The deleted row disappears on refresh, so the confirmation has to live
  // above it — otherwise the only feedback is a row silently vanishing.
  function handleDeleted(asset: ResumeAssetRow) {
    setDeletedNotice(
      asset.id === selectedAsset?.id
        ? copy.deletedCleared.replace("{name}", asset.originalName)
        : copy.deletedKept.replace("{name}", asset.originalName),
    );
    router.refresh();
  }

  function setOptionsOpen(open: boolean) {
    setOptionsState({ key: serverStateKey, open });
  }

  function openPreview(
    asset: ResumeAssetOption,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    previewTriggerRef.current = event.currentTarget;
    setPreviewAsset(asset);
  }

  function closePreview() {
    setPreviewAsset(null);
    window.setTimeout(() => previewTriggerRef.current?.focus());
  }

  async function finishSelection(sourceAssetId: string | null): Promise<boolean> {
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("sourceAssetId", sourceAssetId ?? "");

    try {
      const result = await setResumeSource(formData);
      if (!("ok" in result) || !result.ok) {
        const code = "error" in result ? result.error : "application-action-failed";
        setError(uploadErrorMessage(code, copy, copy.errors.selectionFailed));
        return false;
      }
      router.replace(
        setupMode
          ? `/applications/${applicationId}?tab=difference&setup=1`
          : `/applications/${applicationId}?tab=resume`,
      );
      router.refresh();
      return true;
    } catch {
      setError(copy.errors.selectionFailed);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) {
      setError(copy.errors.missingFile);
      return;
    }
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);

    try {
      const response = await fetch("/api/source-assets", {
        method: "POST",
        body,
      });
      const payload = await readResponse(response);
      if (
        !response.ok ||
        typeof payload.id !== "string" ||
        typeof payload.originalName !== "string"
      ) {
        const code = typeof payload.error === "string" ? payload.error : "upload-failed";
        setError(uploadErrorMessage(code, copy));
        return;
      }

      const linked = await finishSelection(payload.id);
      if (!linked) {
        setFileState({ key: serverStateKey, file: null });
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setError(copy.errors.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFileState({
      key: serverStateKey,
      file: event.currentTarget.files?.[0] ?? null,
    });
    setError(null);
  }

  const title = setupMode ? copy.baselineTitleSetup : copy.baselineTitle;

  return (
    <section
      className="dense-surface min-w-0 p-5 sm:p-6"
      aria-labelledby="baseline-selector-title"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Resume baseline
          </p>
          <h2 id="baseline-selector-title" className="heading-font mt-1 text-2xl font-bold">
            {title}
          </h2>
          <p className="mt-2 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
            {copy.baselineBody}
          </p>
        </div>
        {selectedAsset && !setupMode ? (
          <span className="status-chip bg-[var(--sev-matched)]">{copy.selected}</span>
        ) : null}
      </div>

      {selectedAsset ? (
        <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">{selectedAsset.originalName}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">
                {copy.uploadedOn.replace("{date}", formatDay(selectedAsset.createdAt, locale))}
              </p>
            </div>
            <button
              type="button"
              className="button-secondary min-h-9 px-3 text-xs font-semibold"
              aria-label={copy.previewOf.replace("{name}", selectedAsset.originalName)}
              onClick={(event) => openPreview(selectedAsset, event)}
            >
              {copy.preview}
            </button>
          </div>
        </div>
      ) : null}

      {previewAsset ? (
        <section
          className="soft-surface mt-5 overflow-hidden"
          aria-label={copy.previewAria.replace("{name}", previewAsset.originalName)}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--sev-minor)] px-4 py-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">{previewAsset.originalName}</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--ink-muted)]">
                {copy.privatePreview}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className="button-secondary inline-flex min-h-9 items-center px-3 text-xs font-semibold"
                href={`/api/source-assets/${previewAsset.id}/download`}
                target="_blank"
                rel="noreferrer"
              >
                {copy.openOriginal}
              </a>
              <button
                type="button"
                className="button-secondary min-h-9 px-3 text-xs font-semibold"
                onClick={closePreview}
              >
                {copy.closePreview}
              </button>
            </div>
          </div>
          <iframe
            key={previewAsset.id}
            title={copy.previewOf.replace("{name}", previewAsset.originalName)}
            src={`/api/source-assets/${previewAsset.id}/preview`}
            className="block h-[32rem] w-full bg-[var(--paper)]"
          />
        </section>
      ) : null}

      {showOptions ? (
        <div className="mt-5 space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold">{copy.chooseExisting}</legend>
            {availableAssets.length ? (
              <div className="mt-3 grid gap-2">
                {availableAssets.map((asset) => (
                  <article
                    key={asset.id}
                    className="flex min-h-14 w-full flex-col items-stretch justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-left transition hover:border-[var(--ink)] sm:flex-row sm:items-center"
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold">{asset.originalName}</span>
                      <span className="mt-1 block text-xs font-semibold text-[var(--ink-muted)]">
                        {copy.uploadedOn.replace("{date}", formatDay(asset.createdAt, locale))}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                      <button
                        type="button"
                        className="button-secondary min-h-9 px-3 text-xs font-semibold"
                        onClick={(event) => openPreview(asset, event)}
                        disabled={busy}
                      >
                        {copy.previewOf.replace("{name}", asset.originalName)}
                      </button>
                      <button
                        type="button"
                        className="button-secondary min-h-9 px-3 text-xs font-semibold"
                        onClick={() => void finishSelection(asset.id)}
                        disabled={busy}
                      >
                        {copy.chooseThis.replace("{name}", asset.originalName)}
                      </button>
                      <ResumeFileDeleteControl
                        assetId={asset.id}
                        originalName={asset.originalName}
                        status={asset.status}
                        applicationCount={asset.applicationCount}
                        confirmedFactCount={asset.confirmedFactCount}
                        onDeleted={() => handleDeleted(asset)}
                        copy={copy}
                        common={common}
                      />
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-[var(--ink-muted)]">{copy.noneUploaded}</p>
            )}
          </fieldset>

          <div className="border-t border-[var(--line)] pt-5">
            <label htmlFor={`baseline-upload-${applicationId}`} className="text-sm font-semibold">
              {copy.uploadNewLabel}
            </label>
            <div className="form-input mt-2 flex max-w-full items-center gap-3">
              <input
                ref={inputRef}
                id={`baseline-upload-${applicationId}`}
                key={serverStateKey}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="peer sr-only"
                onChange={handleFileChange}
                disabled={busy}
                aria-describedby={`baseline-upload-help-${applicationId}`}
              />
              <label
                htmlFor={`baseline-upload-${applicationId}`}
                className="button-secondary inline-flex shrink-0 cursor-pointer items-center justify-center px-3 py-1.5 text-sm font-semibold peer-disabled:cursor-not-allowed peer-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]"
              >
                {copy.chooseFile}
              </label>
              <span
                className={`min-w-0 truncate text-sm ${selectedFile ? "font-bold" : "font-medium text-[var(--ink-muted)]"}`}
              >
                {selectedFile?.name ?? copy.noFileChosen}
              </span>
            </div>
            <p id={`baseline-upload-help-${applicationId}`} className="mt-2 text-xs font-medium text-[var(--ink-muted)]">
              {copy.fileNote}
            </p>
            <button
              type="button"
              className="press button-primary mt-3 inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-bold disabled:cursor-wait disabled:opacity-60"
              disabled={busy}
              onClick={() => void upload(selectedFile ?? undefined)}
            >
              {copy.uploadAndUse}
            </button>
          </div>
        </div>
      ) : null}

      {!setupMode && !showOptions ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="button-secondary min-h-10 px-4 text-sm font-semibold"
            onClick={() => setOptionsOpen(true)}
            disabled={busy}
          >
            {copy.swapResume}
          </button>
          <button
            type="button"
            className="button-secondary min-h-10 px-4 text-sm font-semibold"
            onClick={() => setOptionsOpen(true)}
            disabled={busy}
          >
            {copy.uploadNew}
          </button>
        </div>
      ) : null}

      {setupMode ? (
        <button
          type="button"
          className="press mt-5 inline-flex min-h-10 items-center rounded-[10px] border border-[var(--line)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink-muted)] hover:border-[var(--ink-soft)] hover:text-[var(--ink)] disabled:cursor-wait disabled:opacity-60"
          onClick={() => void finishSelection(null)}
          disabled={busy}
        >
          {copy.skipForNow}
        </button>
      ) : null}

      {deletedNotice ? (
        <p role="status" className="mt-4 text-sm font-bold leading-6">
          {deletedNotice}
        </p>
      ) : null}
      {busy ? (
        <p className="mt-4 text-sm font-semibold" aria-live="polite">{copy.saving}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
