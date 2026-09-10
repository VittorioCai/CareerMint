"use client";

import { useState } from "react";

import { Modal } from "@/components/modal";
import type { Dictionary } from "@/i18n/dictionaries/en";

import { FactFields } from "./fact-fields";
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
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  return (
    <article className="min-w-0 border-b border-[var(--line)] bg-[var(--paper)] p-4 last:border-b-0 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`status-chip ${chipClass}`}>{statusCopy[status]}</span>
          <h3 className="heading-font mt-3 break-words text-lg font-semibold">
            {data.title}
          </h3>
          {data.organization ? (
            <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
              {data.organization}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="button-secondary min-h-10 px-3 text-xs font-semibold"
            onClick={() => setEditing((value) => !value)}
          >
            {copy.editFact}
          </button>
          <button
            type="button"
            className="min-h-10 rounded-xl border border-[var(--line)] px-3 text-xs font-semibold text-[var(--error)]"
            disabled={busy}
            onClick={() =>
              void run(() => actions.remove({ factId: fact.id }))
            }
          >
            {copy.deleteFact}
          </button>
        </div>
      </div>

      {!editing ? (
        <div className="mt-4 space-y-3">
          <p className="whitespace-pre-wrap type-body">
            {data.description}
          </p>
          {data.startDate || data.endDate ? (
            <p className="text-xs font-bold text-[var(--ink-muted)]">
              {data.startDate && data.endDate
                ? `${data.startDate} — ${data.endDate}`
                : data.startDate
                  ? copy.dateOpenEnded.replace("{start}", data.startDate)
                  : copy.dateUntil.replace("{end}", data.endDate ?? "")}
            </p>
          ) : null}
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
            <details className="reveal rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3">
              <summary className="text-action cursor-pointer text-xs font-semibold">{copy.viewEvidence}</summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs font-medium leading-5 text-[var(--ink-muted)]">
                {fact.sourceExcerpt}
              </p>
            </details>
          ) : (
            <p className="text-xs font-bold text-[var(--ink-muted)]">{copy.manualNoEvidence}</p>
          )}
        </div>
      ) : (
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
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
          <div className="flex flex-wrap gap-2 sm:col-span-2">
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
          </div>
        </form>
      )}

      {status !== "confirmed" ? (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
          <button
            type="button"
            className="button-primary min-h-10 px-4 text-sm font-semibold"
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
            className="button-secondary min-h-10 px-4 text-sm font-semibold"
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
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}

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
    </article>
  );
}
