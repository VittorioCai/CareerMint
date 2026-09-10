"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Modal } from "@/components/modal";
import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * The word the confirmation field waits for.
 *
 * It is compared character by character against what the user typed, so it
 * stays in English in both languages: translating it and leaving the
 * comparison alone would make the button unreachable for half the readers.
 */
const CONFIRMATION_WORD = "DELETE";

/**
 * The codes `/api/account` can fail with, in the reader's language.
 *
 * Exported so the copy floor can walk them both without rendering the dialog:
 * "the account was not deleted" is only useful if it also says what to do.
 */
export function accountDeleteErrorCopy(copy: Dictionary["settings"]["errors"]) {
  return {
    "storage-delete-incomplete": copy.storageIncomplete,
    "account-delete-failed": copy.deleteFailed,
    "network-lost": copy.networkLost,
  };
}

export function PrivacyControls({ copy, common }: {
  copy: Dictionary["settings"];
  common: Dictionary["common"];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messages = accountDeleteErrorCopy(copy.errors);

  // The typed DELETE and any failure belong to one attempt. Leaving them
  // behind means reopening the dialog presents an already-armed delete button
  // — or a stale error about an account that is still there.
  function dismissDialog() {
    if (busy) return;
    setDialogOpen(false);
    setConfirmation("");
    setError(null);
  }

  async function removeAccount() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      if (response.status === 204) {
        router.replace("/");
        router.refresh();
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const code =
        body && typeof body === "object" && "error" in body
          ? String(body.error)
          : "";
      setError(
        code === "storage-delete-incomplete"
          ? messages["storage-delete-incomplete"]
          : messages["account-delete-failed"],
      );
    } catch {
      setError(messages["network-lost"]);
    } finally {
      setBusy(false);
    }
  }

  // The sentence names the word to type, and the word is the one thing in it
  // that must not be translated — so it is a hole in the sentence rather than
  // two half-sentences that a translator has to reassemble.
  const [beforeWord = "", afterWord = ""] = copy.confirmBody.split("{word}");

  return (
    <div className="space-y-6">
      <section className="dense-surface p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{copy.portabilityEyebrow}</p>
        <h2 className="heading-font mt-2 text-2xl font-bold">{copy.downloadTitle}</h2>
        <p className="mt-2 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
          {copy.downloadBody}
        </p>
        <a href="/api/account/export" className="button-primary mt-5 inline-flex min-h-11 items-center px-5 text-sm font-semibold">
          {copy.downloadCta}
        </a>
      </section>

      <section className="rounded-2xl border border-[var(--danger-line)] bg-[var(--paper)] p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--error)]">{copy.dangerEyebrow}</p>
        <h2 className="heading-font mt-2 text-2xl font-bold">{copy.deleteTitle}</h2>
        <p className="mt-2 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
          {copy.deleteBody}
        </p>
        <button type="button" className="button-secondary press mt-5 min-h-11 px-5 text-sm font-semibold text-[var(--danger)]" onClick={() => setDialogOpen(true)}>
          {copy.deleteCta}
        </button>
      </section>

      <Modal
        open={dialogOpen}
        label={copy.confirmLabel}
        onClose={dismissDialog}
      >
        <h2 className="heading-font text-2xl font-bold">{copy.confirmTitle}</h2>
        <p className="mt-3 type-caption font-medium text-[var(--ink-muted)]">
          {beforeWord}
          <strong className="text-[var(--ink)]">{CONFIRMATION_WORD}</strong>
          {afterWord}
        </p>
        <label className="mt-5 block text-sm font-semibold">
          {copy.confirmField}
          <input className="form-input mt-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        </label>
        {error ? <p role="alert" className="mt-4 text-sm font-bold text-[var(--error)]">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="button-secondary min-h-10 px-4 text-sm font-semibold" disabled={busy} onClick={dismissDialog}>{common.cancel}</button>
          <button type="button" className="button-danger min-h-10 px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40" disabled={confirmation !== CONFIRMATION_WORD || busy} onClick={() => void removeAccount()}>
            {busy ? copy.deleting : copy.confirmDeleteCta}
          </button>
        </div>
      </Modal>
    </div>
  );
}
