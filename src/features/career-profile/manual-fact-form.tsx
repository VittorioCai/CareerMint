"use client";

import { type FormEvent, useState } from "react";

import {
  FactFormMappingError,
  mapFactFormValues,
  type FactFormField,
  type FactFormValues,
  type FactType,
} from "./fact-form-mapping";
import type { Dictionary } from "@/i18n/dictionaries/en";

import { FactFields, pruneFactFormValues } from "./fact-fields";
import type { CareerFactInput } from "./schemas";

type ActionResult = Promise<{ ok: true } | { ok: false; error: string }>;

export function ManualFactForm({
  createFact,
  copy,
  trigger = "button",
}: {
  createFact(input: CareerFactInput): ActionResult;
  copy: Dictionary["profile"];
  /**
   * On an empty profile the card below already offers the primary path, so the
   * manual route becomes a text link inside it rather than a second cream
   * button competing with it.
   */
  trigger?: "button" | "link";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [factType, setFactType] = useState<FactType>("skill");
  const [values, setValues] = useState<FactFormValues>({});
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FactFormField, string>>
  >({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let input: CareerFactInput;
    try {
      input = mapFactFormValues(factType, values);
    } catch (mappingError) {
      if (mappingError instanceof FactFormMappingError) {
        setFieldErrors({
          [mappingError.field]: copy.fieldRequired.replace(
            "{field}",
            copy.fields[mappingError.field],
          ),
        });
        return;
      }
      setError(copy.invalidInput);
      return;
    }
    setBusy(true);
    setError(null);
    setErrorCode(null);
    setFieldErrors({});
    const result = await createFact(input);
    setBusy(false);
    if (result.ok) setOpen(false);
    else {
      setErrorCode(result.error);
      setError(
        result.error === "invalid-input"
          ? copy.invalidInput
          : copy.saveFailed,
      );
    }
  }

  if (!open) {
    return trigger === "link" ? (
      <button
        type="button"
        className="text-action text-sm font-semibold underline decoration-[var(--ink-soft)] underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:decoration-[var(--ink)]"
        onClick={() => setOpen(true)}
      >
        {copy.writeFirst}
      </button>
    ) : (
      <button
        type="button"
        className="press button-primary inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-bold"
        onClick={() => setOpen(true)}
      >
        {copy.addFact}
      </button>
    );
  }

  return (
    <form className="soft-surface mt-4 grid gap-4 p-5 sm:grid-cols-2" noValidate onSubmit={submit}>
      <div className="sm:col-span-2">
        <h2 className="heading-font text-xl font-semibold">{copy.addTitle}</h2>
        <p className="mt-1 text-xs font-medium text-[var(--ink-muted)]">{copy.addNote}</p>
      </div>
      <label className="block text-sm font-semibold">
        {copy.factType}
        <select
          name="factType"
          className="form-input mt-2"
          value={factType}
          onChange={(event) => {
            const next = event.target.value as FactType;
            setFactType(next);
            setValues((current) => pruneFactFormValues(next, current));
            setFieldErrors({});
            setError(null);
          }}
        >
          {(Object.keys(copy.types) as FactType[]).map((type) => (
            <option key={type} value={type}>
              {copy.types[type]}
            </option>
          ))}
        </select>
      </label>
      <FactFields
        factType={factType}
        values={values}
        errors={fieldErrors}
        labels={copy.fields}
        idPrefix="new-fact"
        onChange={(field, value) => {
          setValues((current) => ({ ...current, [field]: value }));
          setFieldErrors((current) => ({ ...current, [field]: undefined }));
        }}
      />
      {error ? <p role="alert" data-error-code={errorCode ?? undefined} className="text-sm font-bold text-[var(--error)] sm:col-span-2">{error}</p> : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="button-primary min-h-10 px-4 text-sm font-semibold" disabled={busy}>{busy ? copy.saving : copy.saveAsPending}</button>
        <button
          type="button"
          className="button-secondary min-h-10 px-4 text-sm font-semibold"
          onClick={() => {
            setOpen(false);
            setError(null);
            setFieldErrors({});
          }}
        >
          取消
        </button>
      </div>
    </form>
  );
}
