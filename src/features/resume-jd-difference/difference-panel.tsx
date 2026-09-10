import Link from "next/link";
import type { ReactNode } from "react";

import type { Dictionary } from "@/i18n/dictionaries/en";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import type { ResumeJDDifferenceRun } from "./repository";
import type { ResumeJDDifferenceOutput } from "./schemas";

export type ResumeJDDifferencePanelProps = {
  applicationId: string;
  run: ResumeJDDifferenceRun | null;
  facts: ConfirmedFactForAnalysis[];
  /**
   * The analysis control. It lives inside this panel's sticker rather than
   * beside it: "start the analysis" and "here is what it found" are two states
   * of one object, and rendering them as two cards made the page open with two
   * competing headers.
   */
  control?: ReactNode;
  stale?: boolean;
};

/**
 * Blunts one thing the model sometimes says.
 *
 * "你不具备…" / "You lack…" states a gap as a fact about the person; the
 * product only ever claims something about the material in front of it.
 *
 * These are literal matches on model output rather than interface copy, so
 * they are not in the dictionary — but they do have to cover both output
 * languages, because the phrasing the prompt forbids exists in both. What
 * replaces them is copy, and comes from the caller.
 */
const PERSONAL_DEFICIENCY =
  /你不具备|用户不具备|\b(?:you|the candidate|the user) (?:lack|do not have|does not have|don't have|doesn't have|are missing|is missing)\b/giu;

function safeCopy(value: string, noEvidence: string) {
  return value.replaceAll(PERSONAL_DEFICIENCY, noEvidence);
}

function resumeEvidence(
  row: { resumeExcerpt: string | null; unsupported: boolean },
  noEvidence: string,
) {
  if (!row.resumeExcerpt || row.unsupported) return noEvidence;
  return row.resumeExcerpt;
}

// Ids can outlive the fact they point at, so only facts the profile still has
// are named. See the same resolver in improvement-panel.tsx.
function resolveCitedFacts(
  profileFactIds: readonly string[],
  factsById: Map<string, ConfirmedFactForAnalysis>,
) {
  return profileFactIds
    .map((id) => factsById.get(id))
    .filter((fact): fact is ConfirmedFactForAnalysis => fact !== undefined);
}

function IssueDetails({
  row,
  citedFacts,
  copy,
}: {
  row: PanelRow;
  citedFacts: ConfirmedFactForAnalysis[];
  copy: Dictionary["difference"];
}) {
  return (
    <details className="reveal group" data-testid={`difference-issue-${row.id}`}>
      <span
        aria-hidden="true"
        className={`severity-band mx-4 mb-1 mt-2.5 block ${severityBandClass[row.severity]}`}
      />
      <summary className="flex cursor-pointer list-none items-start gap-4 rounded-2xl px-4 py-3.5 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] group-open:bg-[var(--canvas)]">
        <span
          aria-hidden="true"
          data-testid="row-badge"
          className={`badge-index heading-font mt-0.5 ${badgeVariant[row.severity]}`}
        >
          {row.badgeMark}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span
              data-testid="row-priority"
              className={`severity-chip ${severityChipClass[row.severity]}`}
            >
              {copy.severity[row.severity]}
            </span>
            <span
              data-testid="row-type"
              className="text-xs font-semibold text-[var(--ink-muted)]"
            >
              {row.typeLabel}
            </span>
          </span>
          <span className="mt-2 block max-w-[64ch] text-base font-bold leading-[1.55]">
            {safeCopy(row.jdTranslation, copy.noEvidence)}
          </span>
          {/* A requirement can quote a whole paragraph. Unclamped it runs
              three lines of grey English above the Chinese judgement it is
              supposed to support; the full text is in the panel below. */}
          <span
            className="foreign mt-1.5 line-clamp-2 break-words type-caption"
            lang="und"
          >
            “{row.jdOriginal}”
          </span>
        </span>
        <span
          aria-hidden="true"
          className="mt-1 grid size-7 shrink-0 place-items-center rounded-full text-[var(--ink-muted)] transition-transform group-open:rotate-180"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </span>
      </summary>
      <div className="mb-2.5 ml-[46px] mr-2 rounded-xl bg-[var(--canvas)] px-5 py-4">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-8 gap-y-5">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              {copy.jdOriginal}
            </dt>
            <dd
              className="mt-2 break-words type-caption text-[var(--ink-muted)]"
              lang="und"
            >
              {row.jdOriginal}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              {copy.resumeStatus}
            </dt>
            <dd className="mt-2 text-sm font-medium leading-[1.65]">
              <span className="block">{safeCopy(row.resumeStatus, copy.noEvidence)}</span>
              <span className="mt-2 block rounded-xl bg-[var(--paper)] px-3 py-2 font-normal text-[var(--ink-muted)]" lang="und">
                {resumeEvidence(row, copy.noEvidence)}
              </span>
            </dd>
          </div>
          {row.problem ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                {copy.problem}
              </dt>
              <dd className="mt-2 text-sm font-medium leading-[1.65]">
                {safeCopy(row.problem, copy.noEvidence)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              {copy.reason}
            </dt>
            <dd className="mt-2 text-sm font-medium leading-[1.65]">
              {safeCopy(row.reason, copy.noEvidence)}
            </dd>
          </div>
          {citedFacts.length ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                {copy.profileEvidence}
              </dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {citedFacts.map((fact) => (
                  <span
                    key={fact.id}
                    className="rounded-full bg-[var(--sev-matched)] px-3 py-1 text-xs font-medium text-[var(--sev-matched-ink)]"
                    title={fact.organization ? `${fact.title} · ${fact.organization}` : fact.title}
                  >
                    {fact.title}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </details>
  );
}

type RowSeverity = "critical" | "gate" | "important" | "minor" | "matched";

type PanelRow = {
  id: string;
  severity: RowSeverity;
  badgeMark: string;
  typeLabel: string;
  jdOriginal: string;
  jdTranslation: string;
  resumeStatus: string;
  resumeExcerpt: string | null;
  unsupported: boolean;
  problem: string | null;
  reason: string;
  profileFactIds: readonly string[];
};

const severityRank: Record<RowSeverity, number> = {
  critical: 0,
  gate: 1,
  important: 2,
  minor: 3,
  matched: 4,
};

const badgeVariant: Record<RowSeverity, string> = {
  critical: "badge-critical",
  gate: "badge-index--gate",
  important: "badge-important",
  minor: "",
  matched: "badge-index--matched",
};

const severityBandClass: Record<RowSeverity, string> = {
  critical: "bg-[var(--sev-critical-ink)]",
  gate: "bg-[var(--sev-gate-ink)]",
  important: "bg-[var(--sev-important-ink)]",
  minor: "bg-[var(--ink-soft)]",
  matched: "bg-[var(--sev-matched-ink)]",
};

const severityChipClass: Record<RowSeverity, string> = {
  critical: "severity-critical",
  gate: "severity-gate",
  important: "severity-important",
  minor: "severity-minor",
  matched: "severity-matched",
};

// One list, ordered so the rows that change what you do next come first, and
// the two that are not part of that sequence — a gate rewriting cannot fix,
// and something already covered — sit at the ends carrying a mark instead of
// a number.
function buildRows(
  result: ResumeJDDifferenceOutput,
  copy: Dictionary["difference"],
): PanelRow[] {
  const issues = result.issues.map((issue) => {
    const isGate = issue.isGate || issue.type === "gate";
    return {
      id: issue.id,
      severity: (isGate ? "gate" : issue.priority) as RowSeverity,
      badgeMark: "",
      typeLabel: copy.issueTypes[issue.type],
      jdOriginal: issue.jdOriginal,
      jdTranslation: issue.jdTranslation,
      resumeStatus: issue.resumeStatus,
      resumeExcerpt: issue.resumeExcerpt,
      unsupported: issue.authenticity === "unsupported",
      problem: issue.problem,
      reason: issue.reason,
      profileFactIds: issue.profileFactIds,
    } satisfies PanelRow;
  });

  const matched = result.matched.map((item) => ({
    id: item.id,
    severity: "matched" as const,
    badgeMark: "",
    typeLabel: copy.hasEvidence,
    jdOriginal: item.jdOriginal,
    jdTranslation: item.jdTranslation,
    resumeStatus: copy.hasEvidenceStatus,
    resumeExcerpt: item.resumeExcerpt,
    unsupported: false,
    problem: null,
    reason: item.reason,
    profileFactIds: item.profileFactIds,
  } satisfies PanelRow));

  const ordered = [...issues, ...matched].sort(
    (left, right) => severityRank[left.severity] - severityRank[right.severity],
  );

  let differenceNumber = 0;
  return ordered.map((row) => ({
    ...row,
    badgeMark:
      row.severity === "gate"
        ? "!"
        : row.severity === "matched"
          ? "✓"
          : String((differenceNumber += 1)),
  }));
}

function tally(
  rows: readonly PanelRow[],
  copy: Dictionary["difference"],
) {
  return (Object.keys(severityRank) as RowSeverity[])
    .map((severity) => ({
      severity,
      label: copy.tally[severity],
      count: rows.filter((row) => row.severity === severity).length,
    }))
    .filter((entry) => entry.count > 0);
}

export function ResumeJDDifferencePanel({
  applicationId,
  run,
  facts,
  control,
  stale = false,
  copy,
}: ResumeJDDifferencePanelProps & { copy: Dictionary["difference"] }) {
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const result = run && run.status === "succeeded" ? run.result : null;

  if (!result || !run) {
    return (
      <section className="soft-surface px-6 py-7 sm:px-8">
        {control}
      </section>
    );
  }

  const rows = buildRows(result, copy);
  const counts = tally(rows, copy);
  const nothingToFix = rows.length > 0 && rows.every((row) => row.severity === "matched");

  return (
    <section
      className="space-y-7"
      aria-labelledby="resume-jd-difference-title"
      data-run-id={run.id}
    >
      {/* The page's one sticker. It carries the conclusion, not decoration. */}
      <section className="soft-surface px-6 py-5 sm:px-7">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-[var(--ink-muted)]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--ink)]">
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${stale ? "bg-[var(--sev-critical-ink)]" : "bg-[var(--mint-strong)]"}`}
            />
            {stale ? copy.stale : copy.complete}
          </span>
          <span aria-hidden="true" className="text-[var(--ink-muted)]">·</span>
          <span lang="und">{run.sourceFilename}</span>
        </p>
        <h2
          id="resume-jd-difference-title"
          className="heading-font mt-2.5 max-w-[34ch] text-xl font-semibold leading-[1.4] sm:text-2xl"
        >
          {safeCopy(result.overallDifference.summary, copy.noEvidence)}
        </h2>

        {/* Counts as a line of marks, using the same badge language the rows
            below use, so the reader learns it once. */}
        <div
          data-testid="severity-tally"
          className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] pt-3.5"
        >
          {counts.map((entry) => (
            <span
              key={entry.severity}
              className="inline-flex items-center gap-2 type-caption text-[var(--ink-muted)]"
            >
              {entry.severity === "gate" || entry.severity === "matched" ? (
                <span
                  aria-hidden="true"
                  // Outside the ramp on purpose: a glyph centred in a 14px
                  // badge, not a size anyone reads.
                  className={`grid size-3.5 place-items-center rounded-full text-[9px] font-semibold leading-none ${
                    entry.severity === "gate"
                      ? "bg-[var(--sev-gate)] text-[var(--sev-gate-ink)]"
                      : "bg-[var(--sev-matched)] text-[var(--sev-matched-ink)]"
                  }`}
                >
                  {entry.severity === "gate" ? "!" : "✓"}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`severity-dot size-2.5 ${severityBandClass[entry.severity]}`}
                />
              )}
              <span className="font-bold text-[var(--ink)]">{entry.count}</span>
              <span>{entry.label}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] pt-4">
          <a
            className="press button-secondary inline-flex min-h-10 items-center px-4 text-sm font-medium"
            href={`/api/applications/${applicationId}/resume-jd-difference/export?runId=${run.id}${stale ? "&stale=1" : ""}`}
            download
          >
            {copy.export}
          </a>
          {control}
        </div>
      </section>

      {/* What the job is actually asking for — a sentence, not three cells. */}
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
        <span className="inline-flex w-fit items-center rounded-full bg-[var(--sev-matched)] px-3 py-1.5 text-xs font-semibold text-[var(--sev-matched-ink)]">
          {copy.jobWants}
        </span>
        <div className="min-w-0">
          <p className="type-body font-medium">
            {safeCopy(result.jobCore.mission, copy.noEvidence)}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {result.jobCore.coreCapabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-full bg-[var(--sev-matched)] px-3 py-1.5 text-sm font-medium text-[var(--sev-matched-ink)]"
              >
                {capability}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section aria-labelledby="specific-differences-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2
            id="specific-differences-title"
            className="heading-font text-xl font-semibold sm:text-2xl"
          >
            {nothingToFix ? copy.allMatchedTitle : copy.listTitle}
          </h2>
          <span className="type-caption font-medium text-[var(--ink-muted)]">
            {nothingToFix
              ? copy.allMatchedHint
              : copy.listHint}
          </span>
        </div>

        <ol className="soft-surface mt-3.5 list-none p-2">
          {rows.map((row) => (
            <li key={row.id}>
              <IssueDetails
                copy={copy}
                row={row}
                citedFacts={resolveCitedFacts(row.profileFactIds, factsById)}
              />
            </li>
          ))}
        </ol>
      </section>

      <section className="soft-surface grid gap-5 px-6 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7">
        <div>
          <h2 className="heading-font text-lg font-semibold">
            {nothingToFix ? copy.nextInterview : copy.nextImprovements}
          </h2>
          <p className="mt-1.5 max-w-[62ch] type-caption font-medium text-[var(--ink-muted)]">
            {nothingToFix
              ? copy.nextInterviewBody
              : copy.nextImprovementsBody}
          </p>
        </div>
        <Link
          href={`/applications/${applicationId}?tab=${nothingToFix ? "interview" : "improvements"}`}
          className="button-primary inline-flex min-h-12 shrink-0 items-center justify-center rounded-full px-6 text-base font-bold"
        >
          {nothingToFix ? copy.goInterview : copy.goImprovements}
        </Link>
      </section>
    </section>
  );
}
