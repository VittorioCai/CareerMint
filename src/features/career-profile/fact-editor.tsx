"use client";

import { useId, useState } from "react";

import { Modal } from "@/components/modal";
import type { Dictionary } from "@/i18n/dictionaries/en";

import { FactFields } from "./fact-fields";
import { useAnnounceFactReceipt } from "./fact-receipt";
import {
  FactFormMappingError,
  factDataToFormValues,
  mapFactFormValues,
  type FactFormField,
} from "./fact-form-mapping";
import type { CareerFact, CareerFactInput } from "./schemas";

type ActionResult = Promise<{ ok: true } | { ok: false; error: string }>;

type FactEditorActions = {
  confirm(input: {
    factId: string;
    explicitConfirmation: boolean;
  }): ActionResult;
  markNeedsDetail(input: { factId: string }): ActionResult;
  update(input: CareerFactInput & { factId: string }): ActionResult;
  remove(input: { factId: string }): ActionResult;
};

export function FactEditor({
  fact,
  actions,
  copy,
  common,
}: {
  fact: CareerFact;
  actions: FactEditorActions;
  copy: Dictionary["profile"];
  common: Dictionary["common"];
}) {
  const statusCopy = copy.status;
  const announceReceipt = useAnnounceFactReceipt();
  const panelId = useId();
  // A confirmed fact has been read and agreed to; what it needs from the page
  // is to be findable. One still waiting is the opposite, so it starts open.
  // Fifty confirmed facts, each laid out in full with two buttons, was fifteen
  // thousand pixels of scrolling.
  const [expanded, setExpanded] = useState(
    fact.confirmationStatus !== "confirmed",
  );
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [explicit, setExplicit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(fact.confirmationStatus);
  const [data, setData] = useState(fact.data);
  const [formValues, setFormValues] = useState(() =>
    factDataToFormValues(fact.factType, fact.data),
  );
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FactFormField, string>>
  >({});

  async function run(action: () => ActionResult, after?: () => void) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(copy.actionFailed);
      return;
    }
    after?.();
  }

  const chipClass =
    status === "confirmed"
      ? "severity-matched"
      : status === "needs_detail"
        ? "bg-[var(--sev-critical)] text-[var(--sev-critical-ink)]"
        : "severity-important";

  const dates =
    data.startDate || data.endDate
      ? data.startDate && data.endDate
        ? `${data.startDate} — ${data.endDate}`
        : data.startDate
          ? copy.dateOpenEnded.replace("{start}", data.startDate)
          : copy.dateUntil.replace("{end}", data.endDate ?? "")
      : null;

  return (
    <article className="min-w-0 border-b border-[var(--line)] bg-[var(--paper)] last:border-b-0">
      {/* The whole header takes a click, for a pointer. The button inside it is
          the control — it is what holds focus and says whether the row is open
          — and its click reaches the same handler by bubbling. */}
      <div
        className="flex cursor-pointer items-start gap-3 px-4 py-3.5 sm:px-5"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className={`status-chip ${chipClass}`}>{statusCopy[status]}</span>
            <h3 className="heading-font min-w-0 break-words text-base font-semibold sm:text-lg">
              {data.title}
            </h3>
          </div>
          {data.organization || dates ? (
            <p className="mt-1 break-words text-xs font-semibold text-[var(--ink-muted)]">
              {[data.organization, dates].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {/* One line of the description while the row is closed, enough to
              tell this fact from the one above it. */}
          {expanded ? null : (
            <p className="mt-1 truncate text-sm font-medium text-[var(--ink-muted)]">
              {data.description}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${expanded ? copy.collapseFact : copy.expandFact}: ${data.title}`}
          // 44px, the size a thumb needs; mobile-layout.spec measures it.
          className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface-muted)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </div>

      {/* Hidden rather than unmounted: a draft in the edit form survives the
          row being closed over it, and the page's own find still reaches the
          text. */}
      <div id={panelId} hidden={!expanded} className="px-4 pb-4 sm:px-5 sm:pb-5">
      {!editing ? (
        <div className="space-y-3">
          <p className="whitespace-pre-wrap type-body">
            {data.description}
          </p>
          {data.skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.skills.map((skill) => (
                <span key={skill} className="rounded-full bg-[var(--sev-minor)] px-2.5 py-1 text-xs font-semibold">
                  {skill}
                </span>
              ))}
            </div>
          ) : null}
          {fact.sourceExcerpt ? (
            <details className="reveal group rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-3">
              {/* A flex row, so the label sits in the middle of the 44px a
                  phone gives it instead of at the top. A flex summary has no
                  marker of its own; the chevron is the one the difference rows
                  use. */}
              <summary className="text-action flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">
                {copy.viewEvidence}
                <span
                  aria-hidden="true"
                  className="grid size-5 shrink-0 place-items-center text-[var(--ink-muted)] transition-transform group-open:rotate-180"
                >
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 8l5 5 5-5" />
                  </svg>
                </span>
              </summary>
              <p className="whitespace-pre-wrap break-words pb-3 text-xs font-medium leading-5 text-[var(--ink-muted)]">
                {fact.sourceExcerpt}
              </p>
            </details>
          ) : (
            <p className="text-xs font-bold text-[var(--ink-muted)]">{copy.manualNoEvidence}</p>
          )}
          {/* One filled button at most, and only on a fact still waiting for
              a decision. Every card used to carry the page's darkest button,
              so a profile with twenty facts to check had twenty main actions.
              Deleting is inside the edit form: it is something done to a fact
              on purpose, not something offered beside its title. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] pt-3">
            {status !== "confirmed" ? (
              <>
                <button
                  type="button"
                  className="button-secondary min-h-10 px-4 text-sm font-semibold"
                  disabled={busy}
                  onClick={() => {
                    setExplicit(false);
                    setConfirming(true);
                  }}
                >
                  {copy.confirmTrue}
                </button>
                <button
                  type="button"
                  className="text-action text-sm font-semibold underline decoration-[var(--ink-soft)] underline-offset-4 hover:decoration-[var(--ink)]"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => actions.markNeedsDetail({ factId: fact.id }),
                      () => setStatus("needs_detail"),
                    )
                  }
                >
                  {copy.needsDetail}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="text-action text-sm font-semibold underline decoration-[var(--ink-soft)] underline-offset-4 hover:decoration-[var(--ink)]"
              onClick={() => setEditing(true)}
            >
              {copy.editFact}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            let input: CareerFactInput;
            try {
              input = mapFactFormValues(fact.factType, formValues);
              setFieldErrors({});
            } catch (mappingError) {
              if (mappingError instanceof FactFormMappingError) {
                setFieldErrors({
                  [mappingError.field]: copy.fieldRequired.replace(
                    "{field}",
                    copy.fields[mappingError.field],
                  ),
                });
              } else {
                setError(copy.invalidInput);
              }
              return;
            }
            void run(
              () =>
                actions.update({
                  factId: fact.id,
                  ...input,
                }),
              () => {
                setData(input.data);
                setFormValues(factDataToFormValues(fact.factType, input.data));
                setStatus("pending");
                setEditing(false);
              },
            );
          }}
        >
          <FactFields
            factType={fact.factType}
            labels={copy.fields}
            values={formValues}
            errors={fieldErrors}
            idPrefix={`fact-${fact.id}`}
            onChange={(field, value) => {
              setFormValues((current) => ({ ...current, [field]: value }));
              setFieldErrors((current) => ({ ...current, [field]: undefined }));
            }}
          />
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button type="submit" className="button-primary min-h-10 px-4 text-sm font-semibold" disabled={busy}>
              {busy ? copy.saving : copy.saveEdits}
            </button>
            <button
              type="button"
              className="button-secondary min-h-10 px-4 text-sm font-semibold"
              onClick={() => {
                setFormValues(factDataToFormValues(fact.factType, data));
                setFieldErrors({});
                setEditing(false);
              }}
            >
              {common.cancel}
            </button>
            <button
              type="button"
              className="text-action ml-auto text-sm font-semibold text-[var(--danger-ink)] underline decoration-transparent underline-offset-4 hover:decoration-current"
              disabled={busy}
              onClick={() => setDeleting(true)}
            >
              {copy.deleteFact}
            </button>
          </div>
        </form>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}
      </div>

      <Modal
        open={confirming}
        label={copy.confirmTitle}
        onClose={() => {
          if (!busy) setConfirming(false);
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">{copy.confirmEyebrow}</p>
        <h2 className="heading-font mt-2 text-2xl font-bold">{copy.confirmTitle}</h2>
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4">
          <p className="font-semibold">{data.title}</p>
          <p className="mt-2 whitespace-pre-wrap type-body">{data.description}</p>
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm font-bold leading-6">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--mint-strong)]"
            checked={explicit}
            onChange={(event) => setExplicit(event.target.checked)}
          />
          <span>{copy.confirmCheckbox}</span>
        </label>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="button-secondary min-h-10 px-4 text-sm font-semibold" onClick={() => setConfirming(false)}>
            {copy.backToReview}
          </button>
          <button
            type="button"
            className="button-primary min-h-10 px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!explicit || busy}
            onClick={() =>
              void run(
                () =>
                  actions.confirm({
                    factId: fact.id,
                    explicitConfirmation: explicit,
                  }),
                () => {
                  setStatus("confirmed");
                  setConfirming(false);
                },
              )
            }
          >
            {copy.confirmAndSave}
          </button>
        </div>
      </Modal>

      {/* Facts are what every analysis cites, and a deleted one does not come
          back. One stray click should not be enough. */}
      <Modal
        open={deleting}
        label={copy.deleteTitle}
        onClose={() => {
          if (!busy) setDeleting(false);
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">{copy.deleteEyebrow}</p>
        <h2 className="heading-font mt-2 text-2xl font-bold">{copy.deleteTitle}</h2>
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4">
          <p className="font-semibold">{data.title}</p>
          <p className="mt-2 whitespace-pre-wrap type-body">{data.description}</p>
        </div>
        <p className="mt-4 text-sm font-medium leading-6 text-[var(--ink-muted)]">{copy.deleteBody}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="button-secondary min-h-10 px-4 text-sm font-semibold"
            disabled={busy}
            onClick={() => setDeleting(false)}
          >
            {common.cancel}
          </button>
          <button
            type="button"
            className="button-danger min-h-10 px-4 text-sm font-semibold disabled:opacity-60"
            disabled={busy}
            onClick={() =>
              // Closed either way: a failure is reported by the alert on the
              // card, which the dialog would otherwise be covering.
              void run(
                () => actions.remove({ factId: fact.id }),
                () =>
                  announceReceipt(
                    copy.deletedReceipt.replace("{title}", data.title),
                  ),
              ).finally(() => setDeleting(false))
            }
          >
            {busy ? copy.deleting : copy.confirmDelete}
          </button>
        </div>
      </Modal>
    </article>
  );
}
