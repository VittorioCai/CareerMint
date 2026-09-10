import Link from "next/link";

import type { Dictionary } from "@/i18n/dictionaries/en";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import type { ResumeJDDifferenceRun } from "./repository";
import type {
  DifferenceIssue,
  DifferenceIssueType,
  ImprovementDirection,
} from "./schemas";

export type ResumeJDImprovementPanelProps = {
  applicationId: string;
  run: ResumeJDDifferenceRun | null;
  facts: ConfirmedFactForAnalysis[];
  freshness: "current" | "stale" | "missing";
};

/**
 * The five groups a difference can fall into, in the order they are shown.
 *
 * Identifiers, not headings. They used to be the Chinese headings themselves,
 * which made the group a piece of copy that other code looked things up by —
 * so translating a heading silently detached every issue from its group and
 * its explanation. The words now live in the dictionary and these do not
 * change with the language.
 */
const groupOrder = [
  "language",
  "evidence",
  "placement",
  "confirmation",
  "gate",
] as const;

type ImprovementGroup = (typeof groupOrder)[number];

const groupByIssueType: Record<DifferenceIssueType, ImprovementGroup> = {
  missing: "confirmation",
  language_misaligned: "language",
  profile_only: "evidence",
  skill_only: "placement",
  too_vague: "evidence",
  missing_context: "evidence",
  missing_result: "evidence",
  needs_confirmation: "confirmation",
  gate: "gate",
};



export function improvementGroupForIssue(
  type: DifferenceIssueType,
): ImprovementGroup {
  return groupByIssueType[type];
}

function targetCopy(
  direction: ImprovementDirection | null,
  copy: Dictionary["improvements"],
) {
  if (!direction) return copy.verifyAsIs;
  const section = copy.targetSections[direction.targetSection];
  return direction.targetExperience
    ? `${section} · ${direction.targetExperience}`
    : section;
}

function uniqueTerms(direction: ImprovementDirection) {
  return [...new Set([...direction.jdTerms, ...direction.synonymousJobLanguage])];
}

function synthesizedGateDirection(
  issue: DifferenceIssue,
  copy: Dictionary["improvements"],
) {
  return {
    target: copy.gateTarget,
    focus: copy.gateFocus,
    authenticity: copy.authenticity[issue.authenticity],
    direction:
      copy.gateDirection,
  };
}

// A run stores fact ids, not facts. Ids can outlive the fact itself — the user
// may have deleted or un-confirmed it since the analysis ran — so a citation is
// only shown for facts the profile still has.
function resolveCitedFacts(
  issue: DifferenceIssue,
  factsById: Map<string, ConfirmedFactForAnalysis>,
) {
  return issue.profileFactIds
    .map((id) => factsById.get(id))
    .filter((fact): fact is ConfirmedFactForAnalysis => fact !== undefined);
}

function ImprovementItem({
  issue,
  direction,
  citedFacts,
  copy,
}: {
  issue: DifferenceIssue;
  direction: ImprovementDirection | null;
  citedFacts: ConfirmedFactForAnalysis[];
  copy: Dictionary["improvements"];
}) {
  const isGate = issue.isGate || issue.type === "gate";
  const unsupported =
    issue.authenticity === "unsupported" ||
    direction?.authenticity === "unsupported";
  const gateDirection = isGate ? synthesizedGateDirection(issue, copy) : null;
  const terms = direction && !unsupported ? uniqueTerms(direction) : [];

  return (
    <article
      className="border-t border-[var(--line)] px-5 py-5 first:border-t-0 sm:px-6"
      data-testid={`improvement-item-${issue.id}`}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            {copy.matchingDifference}
          </p>
          <p className="mt-2 type-body font-medium">
            {issue.jdTranslation}
          </p>
          <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 type-body font-medium">
            {gateDirection?.direction ?? direction?.direction ?? issue.problem}
          </p>
          {unsupported ? (
            <p className="mt-3 rounded-xl border border-[var(--danger-line)] bg-[var(--danger-tint)] px-4 py-3 type-body font-medium">
              {copy.unsupportedWarning}
            </p>
          ) : null}
        </div>

        <dl className="grid content-start gap-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
          <div>
            <dt className="text-xs font-semibold text-[var(--ink-muted)]">{copy.targetLocation}</dt>
            <dd className="mt-1 text-sm font-semibold leading-6">
              {gateDirection?.target ?? targetCopy(direction, copy)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--ink-muted)]">{copy.focus}</dt>
            <dd className="mt-1 text-sm font-bold leading-6">
              {gateDirection?.focus ??
                (direction?.focusAreas.length
                  ? direction.focusAreas.map((area) => copy.focusAreas[area]).join(" · ")
                  : copy.verifyExperience)}
            </dd>
          </div>
          {terms.length ? (
            <div>
              <dt className="text-xs font-semibold text-[var(--ink-muted)]">
                {copy.jobTerms}
              </dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {terms.map((term) => (
                  <span
                    key={term}
                    className="rounded-full border border-[var(--ink)] bg-[var(--sev-minor)] px-3 py-1 text-xs font-semibold"
                    lang="und"
                  >
                    {term}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          {citedFacts.length ? (
            <div>
              <dt className="text-xs font-semibold text-[var(--ink-muted)]">{copy.profileEvidence}</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {citedFacts.map((fact) => (
                  <span
                    key={fact.id}
                    data-testid={`improvement-fact-${fact.id}`}
                    className="rounded-full border border-[var(--ink)] bg-[var(--sev-matched)] px-3 py-1 text-xs font-semibold"
                    title={fact.organization ? `${fact.title} · ${fact.organization}` : fact.title}
                  >
                    {fact.title}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold text-[var(--ink-muted)]">{copy.authenticityLabel}</dt>
            <dd className="mt-1 text-sm font-bold leading-6">
              {gateDirection?.authenticity ??
                copy.authenticity[direction?.authenticity ?? issue.authenticity]}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function Prerequisite({
  applicationId,
  stale,
  copy,
}: {
  applicationId: string;
  stale: boolean;
  copy: Dictionary["improvements"];
}) {
  return (
    <section className="dense-surface px-5 py-8 sm:px-6">
      <h2 className="heading-font text-2xl font-bold">
        {stale ? copy.staleNotice : copy.missingNotice}
      </h2>
      <p className="mt-2 type-caption font-medium text-[var(--ink-muted)]">
        {copy.prerequisiteBody}
      </p>
      <Link
        className="button-secondary mt-5 inline-flex px-4 py-2 text-sm font-semibold"
        href={`/applications/${applicationId}?tab=difference`}
      >
        {copy.goToDifference}
      </Link>
    </section>
  );
}

export function ResumeJDImprovementPanel({
  applicationId,
  run,
  facts,
  freshness,
  copy,
}: ResumeJDImprovementPanelProps & { copy: Dictionary["improvements"] }) {
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  if (
    freshness !== "current" ||
    !run ||
    run.status !== "succeeded" ||
    !run.result
  ) {
    return (
      <Prerequisite
        applicationId={applicationId}
        stale={freshness === "stale"}
        copy={copy}
      />
    );
  }

  const directions = new Map(
    run.result.directions.map((direction) => [direction.issueId, direction]),
  );
  const grouped = new Map<ImprovementGroup, DifferenceIssue[]>();
  for (const issue of run.result.issues) {
    const group = improvementGroupForIssue(issue.type);
    grouped.set(group, [...(grouped.get(group) ?? []), issue]);
  }

  return (
    <section
      className="space-y-8"
      aria-labelledby="improvement-panel-title"
      data-run-id={run.id}
    >
      <header className="soft-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          {copy.eyebrow}
        </p>
        <h2 id="improvement-panel-title" className="heading-font mt-1 text-2xl font-bold sm:text-3xl">
          {copy.title}
        </h2>
        <p className="mt-3 type-body font-medium">
          {copy.body}
        </p>
      </header>

      {groupOrder.map((group) => {
        const issues = grouped.get(group);
        if (!issues?.length) return null;
        return (
          <section key={group} aria-labelledby={`improvement-group-${group}`}>
            <div className="mb-3">
              <h2 id={`improvement-group-${group}`} className="heading-font text-2xl font-bold">
                {copy.groups[group]}
              </h2>
              <p className="mt-1 type-caption font-medium text-[var(--ink-muted)]">
                {copy.groupIntros[group]}
              </p>
            </div>
            <div className="dense-surface overflow-hidden">
              {issues.map((issue) => (
                <ImprovementItem
                  key={issue.id}
                  copy={copy}
                  issue={issue}
                  direction={directions.get(issue.id) ?? null}
                  citedFacts={resolveCitedFacts(issue, factsById)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <section className="soft-surface grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            {copy.eyebrow}
          </p>
          <h2 className="heading-font mt-1 text-xl font-semibold">{copy.nextTitle}</h2>
          <p className="mt-2 type-caption font-medium text-[var(--ink-muted)]">
            {copy.nextBody}
          </p>
        </div>
        <Link
          className="button-secondary press inline-flex justify-center px-4 py-3 text-sm font-semibold"
          href={`/applications/${applicationId}?tab=interview`}
        >
          {copy.goInterview}
        </Link>
      </section>
    </section>
  );
}
