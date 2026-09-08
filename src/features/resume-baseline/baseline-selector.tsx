"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type MouseEvent,
  useRef,
  useState,
} from "react";

import type { ApplicationActionState } from "@/features/applications/actions";

export type ResumeAssetOption = {
  id: string;
  originalName: string;
  contentType: string;
  createdAt: string;
};

export type BaselineSelectorProps = {
  applicationId: string;
  selectedAsset: ResumeAssetOption | null;
  availableAssets: ResumeAssetOption[];
  setupMode: boolean;
  setResumeSource(
    formData: FormData,
  ): Promise<ApplicationActionState>;
};

const uploadErrorMessages: Record<string, string> = {
  "empty-file": "这个文件是空的，请选择另一份简历。",
  "file-too-large": "文件超过 10 MiB，请压缩后重试。",
  "unsupported-content-type": "目前只支持 PDF 和 DOCX 文件。",
  "unsupported-file-signature": "文件内容与支持的简历格式不符。",
  "content-type-mismatch": "文件扩展名和实际内容不一致。",
  "missing-file": "请先选择一份简历。",
  "unauthorized": "登录已失效，请重新登录。",
  "upload-failed": "上传没有完成，请重试。",
};

const actionErrorMessages: Record<string, string> = {
  "invalid-input": "请选择一份有效的私有简历。",
  "application-or-resume-not-found": "这份简历已不可用，请重新选择。",
  "application-storage-error": "暂时无法保存这次简历选择，请重试。",
  "application-action-failed": "暂时无法保存这次简历选择，请重试。",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

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
}: BaselineSelectorProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<ResumeAssetOption | null>(null);
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
        setError(actionErrorMessages[code] ?? actionErrorMessages["application-action-failed"]);
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
      setError(actionErrorMessages["application-action-failed"]);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) {
      setError(uploadErrorMessages["missing-file"]);
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
        setError(uploadErrorMessages[code] ?? "上传没有完成，请重试。");
        return;
      }

      const linked = await finishSelection(payload.id);
      if (!linked) {
        setFileState({ key: serverStateKey, file: null });
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setError("上传没有完成，请重试。");
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

  const title = setupMode ? "本次对照简历（可选）" : "对照简历";

  return (
    <section
      className="dense-surface min-w-0 p-5 sm:p-6"
      aria-labelledby="baseline-selector-title"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Resume baseline
          </p>
          <h2 id="baseline-selector-title" className="heading-font mt-1 text-2xl font-black">
            {title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--ink-muted)]">
            先预览并选择本次对照版本，再进入差异分析；也可以暂时跳过。
          </p>
        </div>
        {selectedAsset && !setupMode ? (
          <span className="status-chip bg-[var(--mint)]">已选择</span>
        ) : null}
      </div>

      {selectedAsset ? (
        <div className="mt-5 rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-black">{selectedAsset.originalName}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">
                上传于 {formatDate(selectedAsset.createdAt)}
              </p>
            </div>
            <button
              type="button"
              className="button-secondary min-h-9 px-3 text-xs font-black"
              aria-label={`预览 ${selectedAsset.originalName}`}
              onClick={(event) => openPreview(selectedAsset, event)}
            >
              预览
            </button>
          </div>
        </div>
      ) : null}

      {previewAsset ? (
        <section
          className="mt-5 overflow-hidden rounded-2xl border-2 border-[var(--ink)] bg-white"
          aria-label={`简历预览：${previewAsset.originalName}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--mist-blue)] px-4 py-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-black">{previewAsset.originalName}</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--ink-muted)]">
                私有预览，不会调用 AI 或 OCR
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className="button-secondary inline-flex min-h-9 items-center px-3 text-xs font-black"
                href={`/api/source-assets/${previewAsset.id}/download`}
                target="_blank"
                rel="noreferrer"
              >
                打开原文件
              </a>
              <button
                type="button"
                className="button-secondary min-h-9 px-3 text-xs font-black"
                onClick={closePreview}
              >
                关闭预览
              </button>
            </div>
          </div>
          <iframe
            key={previewAsset.id}
            title={`预览 ${previewAsset.originalName}`}
            src={`/api/source-assets/${previewAsset.id}/preview`}
            className="block h-[32rem] w-full bg-white"
          />
        </section>
      ) : null}

      {showOptions ? (
        <div className="mt-5 space-y-5">
          <fieldset>
            <legend className="text-sm font-black">选择已有简历</legend>
            {availableAssets.length ? (
              <div className="mt-3 grid gap-2">
                {availableAssets.map((asset) => (
                  <article
                    key={asset.id}
                    className="flex min-h-14 w-full flex-col items-stretch justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-left transition hover:border-[var(--ink)] sm:flex-row sm:items-center"
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-black">{asset.originalName}</span>
                      <span className="mt-1 block text-xs font-semibold text-[var(--ink-muted)]">
                        上传于 {formatDate(asset.createdAt)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                      <button
                        type="button"
                        className="button-secondary min-h-9 px-3 text-xs font-black"
                        onClick={(event) => openPreview(asset, event)}
                        disabled={busy}
                      >
                        预览 {asset.originalName}
                      </button>
                      <button
                        type="button"
                        className="button-secondary min-h-9 px-3 text-xs font-black"
                        onClick={() => void finishSelection(asset.id)}
                        disabled={busy}
                      >
                        选择 {asset.originalName}
                      </button>
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-[var(--ink-muted)]">还没有已上传的简历。</p>
            )}
          </fieldset>

          <div className="border-t border-[var(--line)] pt-5">
            <label htmlFor={`baseline-upload-${applicationId}`} className="text-sm font-black">
              上传新的 PDF 或 DOCX 简历
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
                className="shrink-0 cursor-pointer rounded-lg border border-[var(--ink)] bg-[var(--mint)] px-3 py-1.5 text-sm font-black peer-disabled:cursor-not-allowed peer-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--mist-blue)]"
              >
                选择文件
              </label>
              <span
                className={`min-w-0 truncate text-sm ${selectedFile ? "font-bold" : "font-medium text-[var(--ink-soft)]"}`}
              >
                {selectedFile?.name ?? "尚未选择文件"}
              </span>
            </div>
            <p id={`baseline-upload-help-${applicationId}`} className="mt-2 text-xs font-medium text-[var(--ink-muted)]">
              支持 PDF、DOCX，最大 10 MiB。原文件只保存在你的私有空间。
            </p>
            <button
              type="button"
              className="button-secondary mt-3 min-h-10 px-4 text-sm font-black disabled:cursor-wait disabled:opacity-60"
              disabled={busy}
              onClick={() => void upload(selectedFile ?? undefined)}
            >
              上传并使用这份简历
            </button>
          </div>
        </div>
      ) : null}

      {!setupMode && !showOptions ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="button-secondary min-h-10 px-4 text-sm font-black"
            onClick={() => setOptionsOpen(true)}
            disabled={busy}
          >
            更换简历
          </button>
          <button
            type="button"
            className="button-secondary min-h-10 px-4 text-sm font-black"
            onClick={() => setOptionsOpen(true)}
            disabled={busy}
          >
            上传新简历
          </button>
        </div>
      ) : null}

      {setupMode ? (
        <button
          type="button"
          className="button-primary mt-5 min-h-11 px-5 text-sm font-black disabled:cursor-wait disabled:opacity-60"
          onClick={() => void finishSelection(null)}
          disabled={busy}
        >
          暂时跳过，进入申请
        </button>
      ) : null}

      {busy ? (
        <p className="mt-4 text-sm font-black" aria-live="polite">正在保存…</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
