"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import type { Application } from "@/features/applications/schemas";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import type { InterviewActionState } from "./actions";
import type { Dictionary } from "@/i18n/dictionaries/en";

import {
  INTERVIEW_PREPARATION_STATUSES,
  type InterviewPreparationStatus,
  type InterviewQuestion,
  type InterviewQuestionCategory,
} from "./schemas";

type BoundAction = (formData: FormData) => Promise<InterviewActionState>;

/** Server error codes to the sentence that explains each one. */
export function interviewErrorMessage(
  code: string,
  copy: Dictionary["interview"],
): string {
  const messages: Record<string, string> = {
    "invalid-input": copy.errors.invalidInput,
    "invalid-interview-operation": copy.errors.invalidOperation,
    "interview-resource-not-found": copy.errors.notFound,
    "interview-storage-error": copy.errors.storageError,
    "interview-action-failed": copy.errors.storageError,
  };
  return messages[code] ?? copy.errors.storageError;
}

function resultError(
  result: InterviewActionState,
  copy: Dictionary["interview"],
) {
  if ("ok" in result && !result.ok) {
    return interviewErrorMessage(result.error, copy);
  }
  return null;
}

export function NewInterviewQuestionForm({
  applications,
  fixedApplicationId = null,
  addQuestion,
  refresh,
  copy,
}: {
  applications: Array<Pick<Application, "id" | "companyName" | "roleTitle">>;
  fixedApplicationId?: string | null;
  addQuestion: BoundAction;
  refresh?: () => void;
  copy: Dictionary["interview"];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState<InterviewQuestionCategory>(
    fixedApplicationId ? "job_specific" : "common",
  );
  const [applicationId, setApplicationId] = useState(
    fixedApplicationId ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    const formData = new FormData();
    formData.set("prompt", prompt);
    formData.set("category", category);
    formData.set("applicationId", fixedApplicationId ?? applicationId);
    try {
      const result = await addQuestion(formData);
      const message = resultError(result, copy);
      if (message) {
        setError(message);
        return;
      }
      setPrompt("");
      setSuccess(true);
      (refresh ?? router.refresh)();
    } catch {
      setError(copy.errors.storageError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="self-start rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">
            {copy.addEyebrow}
          </p>
          <h2 className="heading-font mt-1 text-xl font-semibold">{copy.addTitle}</h2>
        </div>
        <span className="status-chip bg-[var(--paper)]">{copy.noAiCost}</span>
      </div>
      <label className="mt-4 block text-sm font-semibold">
        {copy.coreQuestion}
        <textarea
          className="form-input mt-2 min-h-24 resize-y"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={copy.coreQuestionPlaceholder}
          minLength={8}
          maxLength={500}
          required
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          {copy.category}
          <select
            className="form-input mt-2"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as InterviewQuestionCategory)
            }
          >
            {Object.entries(copy.categories).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {fixedApplicationId ? (
          <input type="hidden" value={fixedApplicationId} readOnly />
        ) : (
          <label className="text-sm font-semibold">
            {copy.linkedJob}
            <select
              className="form-input mt-2"
              value={applicationId}
              onChange={(event) => setApplicationId(event.target.value)}
              required={category === "job_specific"}
            >
              <option value="">{copy.noLinkedJob}</option>
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.roleTitle} · {application.companyName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <button
        type="submit"
        className="button-primary mt-4 min-h-11 px-5 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
        disabled={busy}
      >
        {busy ? copy.adding : copy.add}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          className="mt-3 text-sm font-bold text-[var(--mint-strong)]"
        >
          {copy.added}
        </p>
      ) : null}
    </form>
  );
}



const statusColors: Record<InterviewPreparationStatus, string> = {
  not_started: "bg-[var(--paper)]",
  outlined: "bg-[var(--sev-minor)]",
  practiced: "bg-[var(--surface-muted)]",
  ready: "bg-[var(--sev-matched)]",
};

export function QuestionPreparationCard({
  question,
  applicationId = null,
  availableFacts,
  updateQuestion,
  addVariant,
  refresh,
  copy,
}: {
  question: InterviewQuestion;
  applicationId?: string | null;
  availableFacts: ConfirmedFactForAnalysis[];
  updateQuestion: BoundAction;
  addVariant: BoundAction;
  refresh?: () => void;
  copy: Dictionary["interview"];
}) {
  const router = useRouter();
  const applicationLink = question.applicationLinks.find(
    (link) => link.applicationId === applicationId,
  );
  const [status, setStatus] = useState(question.preparationStatus);
  const [outline, setOutline] = useState(question.answerOutline ?? "");
  const [notes, setNotes] = useState(question.notes ?? "");
  const [selectedFacts, setSelectedFacts] = useState(
    () => new Set(question.facts.map((fact) => fact.id)),
  );
  const [variant, setVariant] = useState("");
  const [busy, setBusy] = useState<"preparation" | "variant" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sortedFacts = useMemo(
    () =>
      [...availableFacts].sort((left, right) => {
        const storyDelta = Number(right.factType === "story") - Number(left.factType === "story");
        return storyDelta || left.title.localeCompare(right.title);
      }),
    [availableFacts],
  );

  async function savePreparation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("preparation");
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("questionId", question.id);
    formData.set("applicationId", applicationId ?? "");
    formData.set("preparationStatus", status);
    formData.set("answerOutline", outline);
    formData.set("notes", notes);
    for (const factId of selectedFacts) formData.append("factIds", factId);
    try {
      const result = await updateQuestion(formData);
      const failure = resultError(result, copy);
      if (failure) {
        setError(failure);
        return;
      }
      setMessage(copy.preparationSaved);
      (refresh ?? router.refresh)();
    } catch {
      setError(copy.errors.storageError);
    } finally {
      setBusy(null);
    }
  }

  async function saveVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("variant");
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("questionId", question.id);
    formData.set("applicationId", applicationId ?? "");
    formData.set("wording", variant);
    try {
      const result = await addVariant(formData);
      const failure = resultError(result, copy);
      if (failure) {
        setError(failure);
        return;
      }
      setVariant("");
      setMessage(copy.variantSaved);
      (refresh ?? router.refresh)();
    } catch {
      setError(copy.errors.storageError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="status-chip bg-[var(--sev-minor)]">
          {copy.categories[question.category]}
        </span>
        <span className={`status-chip ${statusColors[question.preparationStatus]}`}>
          {copy.statuses[question.preparationStatus]}
        </span>
        {applicationLink?.predicted || question.source === "ai" ? (
          <span className="status-chip bg-[var(--sev-critical)] text-[var(--sev-critical-ink)]">
            {copy.mightAsk}
          </span>
        ) : null}
        <span className="type-eyebrow text-[var(--ink-muted)]">
          {copy.sources[question.source]}
        </span>
      </div>
      <h3 className="heading-font mt-3 text-xl font-semibold leading-7">
        {question.prompt}
      </h3>
      {applicationLink?.relevanceReason ? (
        <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
          {applicationLink.relevanceReason}
        </p>
      ) : null}
      {applicationLink?.sourceExcerpt ? (
        <p className="mt-2 rounded-lg bg-[var(--canvas)] px-3 py-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
          <span className="font-semibold text-[var(--ink)]">{copy.jdBasis}</span>
          “{applicationLink.sourceExcerpt}”
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--ink-muted)]">
        <span>{copy.variantCount.replace("{count}", String(question.variants.length))}</span>
        <span aria-hidden="true">·</span>
        <span>{copy.factCount.replace("{count}", String(question.facts.length))}</span>
        {question.applicationLinks.length ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{copy.usedInJobs.replace("{count}", String(question.applicationLinks.length))}</span>
          </>
        ) : null}
      </div>
      {question.variants.length ? (
        <ul className="mt-3 space-y-1 rounded-lg bg-[var(--canvas)] px-3 py-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
          {question.variants.map((item) => (
            <li key={item.id}>{copy.alsoAsked.replace("{wording}", item.wording)}</li>
          ))}
        </ul>
      ) : null}

      <details className="reveal mt-4 rounded-xl bg-[var(--canvas)] p-3">
        <summary className="text-action cursor-pointer text-sm font-semibold">{copy.prepareAnswer}</summary>
        <form onSubmit={savePreparation} className="mt-4 space-y-4">
          <label className="block text-sm font-semibold">
            {copy.prepStatus}
            <select
              className="form-input mt-2"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as InterviewPreparationStatus)
              }
            >
              {INTERVIEW_PREPARATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {copy.statuses[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            {copy.outline}
            <textarea
              className="form-input mt-2 min-h-32 resize-y"
              value={outline}
              onChange={(event) => setOutline(event.target.value)}
              placeholder={copy.outlinePlaceholder}
              maxLength={10_000}
            />
          </label>
          <label className="block text-sm font-semibold">
            {copy.practiceNotes}
            <textarea
              className="form-input mt-2 min-h-24 resize-y"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={copy.practiceNotesPlaceholder}
              maxLength={10_000}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold">{copy.linkedFacts}</legend>
            {sortedFacts.length ? (
              <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3">
                {sortedFacts.map((fact) => (
                  <label
                    key={fact.id}
                    className="flex cursor-pointer items-start gap-3 text-xs font-semibold"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--mint-strong)]"
                      checked={selectedFacts.has(fact.id)}
                      onChange={(event) => {
                        setSelectedFacts((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(fact.id);
                          else next.delete(fact.id);
                          return next;
                        });
                      }}
                    />
                    <span>
                      <span className="font-semibold">{fact.title}</span>
                      <span className="mt-0.5 block text-[var(--ink-muted)]">
                        {fact.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-[var(--ink-muted)]">
                {copy.noFactsYet}
              </p>
            )}
          </fieldset>
          <button
            type="submit"
            className="button-primary min-h-10 px-4 text-xs font-semibold disabled:cursor-wait disabled:opacity-60"
            disabled={busy !== null}
          >
            {busy === "preparation" ? copy.savingPreparation : copy.savePreparation}
          </button>
        </form>

        <form
          onSubmit={saveVariant}
          className="mt-5 border-t border-[var(--line)] pt-4"
        >
          <label className="block text-sm font-semibold">
            {copy.addVariant}
            <input
              className="form-input mt-2"
              value={variant}
              onChange={(event) => setVariant(event.target.value)}
              placeholder={copy.variantPlaceholder}
              minLength={8}
              maxLength={500}
              required
            />
          </label>
          <button
            type="submit"
            className="button-secondary mt-3 min-h-10 px-4 text-xs font-semibold disabled:cursor-wait disabled:opacity-60"
            disabled={busy !== null}
          >
            {busy === "variant" ? copy.savingVariant : copy.saveVariant}
          </button>
        </form>
      </details>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="mt-3 text-sm font-bold text-[var(--mint-strong)]"
        >
          {message}
        </p>
      ) : null}
    </article>
  );
}
