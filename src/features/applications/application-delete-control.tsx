"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { Dictionary } from "@/i18n/dictionaries/en";

import type { ApplicationActionState } from "./actions";

/**
 * Error codes to the dictionary path that explains them.
 *
 * The message is looked up at render time rather than stored here: the code
 * comes from the server and does not change with the language, the sentence
 * does. `src/features/error-copy.test.ts` walks this table and checks each
 * entry names something the reader can act on.
 */
export function applicationDeleteMessage(
  code: string,
  copy: Dictionary["applications"],
): string {
  const messages: Record<string, string> = {
    "application-not-found": copy.deleteErrors.notFound,
    "deletion-confirmation-required": copy.deleteErrors.confirmationRequired,
    "invalid-input": copy.deleteErrors.invalidInput,
    "application-storage-error": copy.deleteErrors.storageError,
    "application-action-failed": copy.deleteErrors.storageError,
  };
  return messages[code] ?? copy.deleteErrors.storageError;
}

export function ApplicationDeleteControl({
  applicationId,
  companyName,
  roleTitle,
  redirectAfterDelete = false,
  compact = false,
  deleteApplication,
  copy,
  common,
}: {
  applicationId: string;
  companyName: string;
  roleTitle: string;
  redirectAfterDelete?: boolean;
  compact?: boolean;
  deleteApplication: (formData: FormData) => Promise<ApplicationActionState>;
  copy: Dictionary["applications"];
  common: Dictionary["common"];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [pending, startTransition] = useTransition();

  if (deleted) {
    return (
      <p role="status" className="text-xs font-bold text-[var(--ink-muted)]">
        {copy.deleted}
      </p>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setExpanded(true);
        }}
        // Destructive, but not the most prominent thing on a card about a job
        // you are applying for. It stays muted until you reach for it.
        className={compact
          // --ink-soft on white is 2.71:1, below the 4.5:1 floor. Muted is
          // 5.94:1 and still reads as secondary next to the role title.
          ? "text-action text-xs font-medium text-[var(--ink-muted)] underline decoration-transparent underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:text-[var(--danger)] hover:decoration-current focus-visible:text-[var(--danger)]"
          : "press text-action inline-flex min-h-10 items-center rounded-[10px] border border-[var(--line)] px-4 text-sm font-medium text-[var(--ink-muted)] hover:border-[var(--danger-line)] hover:text-[var(--danger)]"}
      >
        {copy.deleteRecord}
      </button>
    );
  }

  function submitDeletion() {
    setError(null);
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("confirmed", "true");
    if (redirectAfterDelete) formData.set("redirectAfterDelete", "true");

    startTransition(async () => {
      const result = await deleteApplication(formData);
      if ("ok" in result && result.ok) {
        setDeleted(true);
        router.refresh();
        return;
      }
      const code = "error" in result ? result.error : "application-action-failed";
      setError(applicationDeleteMessage(code, copy));
    });
  }

  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-tint)] p-3 text-left"
    >
      <p className="text-xs font-semibold text-[var(--ink)]">
        {copy.deleteWarningTitle
          .replace("{company}", companyName)
          .replace("{role}", roleTitle)}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
        {copy.deleteWarningBody}
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
          {pending ? copy.deleting : copy.confirmDelete}
        </button>
      </div>
    </div>
  );
}
