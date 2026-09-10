"use client";

import Link from "next/link";

import type { Dictionary } from "@/i18n/dictionaries/en";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { InterviewGenerationActionState } from "./generation-actions";
import type {
  InterviewQuestionGenerationCandidateRecord,
  InterviewQuestionGenerationRun,
} from "./generation-service";

type BoundAction = (
  formData: FormData,
) => Promise<InterviewGenerationActionState>;

type CandidateOverride = Partial<
  Pick<InterviewQuestionGenerationCandidateRecord, "status" | "questionId">
>;



async function responseBody(response: Response) {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Server error codes to the sentence that explains each one.
 *
 * The fallback is the caller's, because the two call sites mean different
 * things by an unrecognised code: a live request that failed is a connection
 * problem, while a stored run carrying a code this version does not know is
 * the provider having not finished.
 */
export function generationErrorMessage(
  code: string,
  copy: Dictionary["interview"],
  fallback: string,
): string {
  const messages: Record<string, string> = {
    "interview-question-generation-unavailable": copy.errors.unavailable,
    "interview-question-generation-invalid-output": copy.errors.invalidOutput,
    "interview-question-generation-provider-error": copy.errors.providerError,
    "interview-question-generation-request-failed": copy.errors.requestFailed,
  };
  return messages[code] ?? fallback;
}

function safeFailure(code: unknown, copy: Dictionary["interview"]) {
  return typeof code === "string"
    ? generationErrorMessage(code, copy, copy.errors.providerError)
    : copy.errors.providerError;
}

function costLabel(
  run: InterviewQuestionGenerationRun | null,
  copy: Dictionary["interview"],
) {
  const cost = run?.result?.estimatedCost;
    return cost
    ? copy.estimatedCost
        .replace("{amount}", String(cost.amount))
        .replace("{currency}", cost.currency)
    : null;
}

export function InterviewQuestionGenerationControl({
  applicationId,
  initialRun,
  initialCandidates,
  acceptCandidates,
  rejectCandidates,
  request = fetch,
  refresh,
  consentRequired = false,
  copy,
}: {
  applicationId: string;
  initialRun: InterviewQuestionGenerationRun | null;
  initialCandidates: InterviewQuestionGenerationCandidateRecord[];
  acceptCandidates: BoundAction;
  rejectCandidates: BoundAction;
  request?: typeof fetch;
  refresh?: () => void;
  consentRequired?: boolean;
  copy: Dictionary["interview"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"generate" | "accept" | "reject" | null>(null);
  const run = initialRun;
  const [candidateOverrides, setCandidateOverrides] = useState<
    Record<string, CandidateOverride>
  >({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const candidates = initialCandidates.map((candidate) => ({
    ...candidate,
    ...candidateOverrides[candidate.id],
  }));

  async function generate() {
    if (busy || consentRequired) return;
    setBusy("generate");
    setSuccess(null);
    setError(null);
    try {
      const response = await request(
        `/api/applications/${applicationId}/interview/questions/generate`,
        { method: "POST" },
      );
      const body = await responseBody(response);
      if (response.status === 403 && body.error === "ai-processing-consent-required") {
        setError(copy.consentFirst);
        return;
      }
      if (!response.ok) throw new Error("interview-question-generation-request-failed");
      if (body.status === "succeeded") {
        setSuccess(body.reused ? copy.reused : copy.generated);
        (refresh ?? router.refresh)();
        return;
      }
      if (body.status === "running" || body.status === "queued") {
        setSuccess(copy.inProgress);
        return;
      }
      if (body.status === "failed") {
        setError(safeFailure(body.errorCode, copy));
        return;
      }
      throw new Error("interview-question-generation-request-failed");
    } catch {
      setError(copy.errors.requestFailed);
    } finally {
      setBusy(null);
    }
  }

  function toggleCandidate(candidateId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  async function acceptSelected() {
    if (busy || selected.size === 0) return;
    setBusy("accept");
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    for (const candidateId of selected) formData.append("candidateIds", candidateId);
    try {
      const result = await acceptCandidates(formData);
      if (!result.ok || !("accepted" in result)) {
        setError(copy.addFailed);
        return;
      }
      const newCount = result.accepted.filter((item) => item.disposition === "new").length;
      const reusedCount = result.accepted.filter((item) => item.disposition === "reused").length;
      const duplicateCount = result.accepted.filter((item) => item.disposition === "duplicate-common").length;
      setCandidateOverrides((current) => {
        const next = { ...current };
        for (const decision of result.accepted) {
          next[decision.candidateId] = {
            ...next[decision.candidateId],
            status:
              decision.disposition === "duplicate-common"
                ? "rejected"
                : "accepted",
            questionId: decision.questionId,
          };
        }
        return next;
      });
      setSelected(new Set());
      setSuccess(
        copy.processed
          .replace("{total}", String(result.accepted.length))
          .replace("{added}", String(newCount))
          .replace("{reused}", String(reusedCount))
          .replace("{duplicate}", String(duplicateCount)),
      );
      (refresh ?? router.refresh)();
    } catch {
      setError(copy.addFailed);
    } finally {
      setBusy(null);
    }
  }

  async function rejectSelected() {
    if (busy || selected.size === 0 || !run) return;
    setBusy("reject");
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("runId", run.id);
    for (const candidateId of selected) formData.append("candidateIds", candidateId);
    try {
      const result = await rejectCandidates(formData);
      if (!result.ok || !("rejectedCount" in result)) {
        setError(copy.rejectFailed);
        return;
      }
      if (result.rejectedCount !== selected.size) {
        setSelected(new Set());
        setSuccess(copy.candidatesRefreshed);
        (refresh ?? router.refresh)();
        return;
      }
      setCandidateOverrides((current) => {
        const next = { ...current };
        for (const candidateId of selected) {
          next[candidateId] = {
            ...next[candidateId],
            status: "rejected",
          };
        }
        return next;
      });
      setSelected(new Set());
      setSuccess(copy.rejected.replace("{count}", String(result.rejectedCount)));
      (refresh ?? router.refresh)();
    } catch {
      setError(copy.rejectFailed);
    } finally {
      setBusy(null);
    }
  }

  const buttonLabel =
    busy === "generate"
      ? copy.generating
      : run?.status === "failed"
        ? copy.regenerate
        : copy.generate;
  const cost = costLabel(run, copy);
  const initialFailure = run?.status === "failed" ? safeFailure(run.errorCode, copy) : null;

  return (
    <section className="soft-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">{copy.generateEyebrow}</p>
          <h2 className="heading-font mt-2 text-2xl font-bold">{copy.generateTitle}</h2>
          <p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-[var(--ink)]">
            {copy.generateBody}
          </p>
        </div>
        <button
          type="button"
          className="button-primary min-h-11 shrink-0 px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy !== null || consentRequired}
          onClick={() => void generate()}
        >
          {buttonLabel}
        </button>
      </div>

      {consentRequired ? (
        <p role="alert" className="mt-3 text-sm font-bold text-[var(--ink)]">
          {copy.consentNeeded}{" "}
          <Link href="/settings/account" className="underline underline-offset-4">
            {copy.goToSettings}
          </Link>
        </p>
      ) : null}

      {cost ? <p className="mt-3 text-xs font-semibold text-[var(--ink)]">{cost}</p> : null}
      <div aria-live="polite" className="mt-3">
        {success ? <p role="status" className="text-sm font-bold text-[var(--ink)]">{success}</p> : null}
        {error || initialFailure ? (
          <p role="alert" className="text-sm font-bold text-[var(--ink)]">
            {error ?? initialFailure}
          </p>
        ) : null}
      </div>

      {candidates.length ? (
        <div className="mt-5 space-y-3" aria-label={copy.candidatesLabel}>
          {candidates.map((candidate) => {
            const pending = candidate.status === "pending";
            return (
              <article key={candidate.id} className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-5 accent-[var(--ink)]"
                    aria-label={candidate.prompt}
                    checked={selected.has(candidate.id)}
                    disabled={!pending || busy !== null}
                    onChange={() => toggleCandidate(candidate.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="status-chip bg-[var(--sev-minor)]">{copy.categories[candidate.category]}</span>
                      <span className="status-chip bg-[var(--sev-critical)] text-[var(--sev-critical-ink)]">{copy.mightAsk}</span>
                      <span className="status-chip bg-[var(--paper)]">{copy.candidateStatuses[candidate.status]}</span>
                    </div>
                    <h3 className="heading-font mt-3 text-lg font-semibold leading-7">{candidate.prompt}</h3>
                    <p className="mt-3 rounded-lg bg-[var(--canvas)] px-3 py-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
                      <span className="font-semibold text-[var(--ink)]">{copy.jdBasis}</span>“{candidate.sourceExcerpt}”
                    </p>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
                      <span className="font-semibold text-[var(--ink)]">{copy.whyRelevant}</span>{candidate.relevanceReason}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="button-primary min-h-10 px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selected.size === 0 || busy !== null}
              onClick={() => void acceptSelected()}
            >
              {busy === "accept" ? copy.accepting : copy.acceptSelected}
            </button>
            <button
              type="button"
              className="button-secondary min-h-10 px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selected.size === 0 || busy !== null}
              onClick={() => void rejectSelected()}
            >
              {busy === "reject" ? copy.rejecting : copy.rejectAll}
            </button>
          </div>
        </div>
      ) : run?.status === "succeeded" && candidates.length === 0 ? (
        <p className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 text-sm font-bold text-[var(--ink-muted)]">
          {copy.noCandidates}
        </p>
      ) : null}
    </section>
  );
}
