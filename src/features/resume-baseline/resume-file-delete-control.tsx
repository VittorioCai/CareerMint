"use client";

import { useState, useTransition } from "react";

import type { Dictionary } from "@/i18n/dictionaries/en";

import type { SourceAssetStatus } from "./asset-usage";

/**
 * What a failed deletion says, keyed by the outcome that produced it.
 *
 * A table rather than three `setError` calls so the copy floor can walk every
 * outcome in both languages without rendering the component: a message that
 * only names an action in one language still leaves half the readers stuck.
 */
export function resumeFileDeleteErrorCopy(copy: Dictionary["resume"]["errors"]) {
  return {
    "network-lost": copy.networkLost,
    "source-asset-in-use": copy.inUse,
    "delete-failed": copy.deleteFailed,
  };
}

// What the user gives up, stated before they commit rather than discovered
// after. The file itself is the only thing that goes.
function usageCopy(
  applicationCount: number,
  confirmedFactCount: number,
  copy: Dictionary["resume"],
) {
  const fill = (template: string) =>
    template
      .replace("{applications}", String(applicationCount))
      .replace("{facts}", String(confirmedFactCount));
  if (applicationCount && confirmedFactCount) return fill(copy.usage.both);
  if (applicationCount) return fill(copy.usage.applications);
  if (confirmedFactCount) return fill(copy.usage.facts);
  return copy.usage.none;
}

export function ResumeFileDeleteControl({
  assetId,
  originalName,
  status,
  applicationCount,
  confirmedFactCount,
  onDeleted,
  copy,
  common,
}: {
  assetId: string;
  originalName: string;
  status: SourceAssetStatus;
  applicationCount: number;
  confirmedFactCount: number;
  onDeleted: () => void;
  copy: Dictionary["resume"];
  common: Dictionary["common"];
}) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitDeletion() {
    setError(null);
    startTransition(async () => {
      let response: Response;
      try {
        response = await fetch(`/api/source-assets/${assetId}`, {
          method: "DELETE",
        });
      } catch {
        setError(resumeFileDeleteErrorCopy(copy.errors)["network-lost"]);
        return;
      }

      // A 404 means someone already removed it — the user's intent is met.
      if (response.ok || response.status === 404) {
        onDeleted();
        return;
      }
      const messages = resumeFileDeleteErrorCopy(copy.errors);
      setError(
        response.status === 409
          ? messages["source-asset-in-use"]
          : messages["delete-failed"],
      );
    });
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setExpanded(true);
        }}
        className="button-secondary min-h-9 px-3 text-xs font-semibold text-[var(--danger)]"
      >
        {copy.deleteFile.replace("{name}", originalName)}
      </button>
    );
  }

  return (
    <div
      role="alert"
      className="w-full rounded-xl border border-[var(--danger-line)] bg-[var(--danger-tint)] p-3 text-left"
    >
      <p className="text-xs font-semibold text-[var(--ink)]">
        {copy.deleteConfirmTitle.replace("{name}", originalName)}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
        {copy.deleteBody}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
        {usageCopy(applicationCount, confirmedFactCount, copy)}
      </p>
      {status === "extracting" ? (
        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--danger)]">
          {copy.deleteExtracting}
        </p>
      ) : null}
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
        {copy.deleteIrreversible}
      </p>
      {error ? (
        <p className="mt-2 text-xs font-semibold text-[var(--danger)]">{error}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setExpanded(false);
          }}
          className="button-secondary px-3 py-2 text-xs font-medium disabled:opacity-60"
        >
          {common.cancel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={submitDeletion}
          className="button-danger px-3 py-2 text-xs font-semibold disabled:opacity-60"
        >
          {pending ? copy.deleting : copy.confirmDeleteFile}
        </button>
      </div>
    </div>
  );
}
