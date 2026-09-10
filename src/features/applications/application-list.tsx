import Link from "next/link";

import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatDay } from "@/i18n/format";
import type { AppLocale } from "@/i18n/locale";

import { ApplicationDeleteControl } from "./application-delete-control";
import type { ApplicationActionState } from "./actions";

import {
  APPLICATION_STAGES,
  type Application,
  type ApplicationFilter,
  type ApplicationStage,
} from "./schemas";

const stageTone: Record<ApplicationStage, string> = {
  preparing: "bg-[var(--surface-muted)]",
  applied: "bg-[var(--sev-minor)]",
  hr: "bg-[var(--paper)]",
  interview: "bg-[var(--sev-critical)] text-[var(--sev-critical-ink)]",
  offer: "bg-[var(--sev-matched)]",
  rejected: "bg-[var(--sev-gate)]",
  withdrawn: "bg-[var(--sev-minor)]",
};


export function filterApplications(
  applications: Application[],
  filter: ApplicationFilter,
) {
  const query = filter.q.toLocaleLowerCase();
  return applications.filter((application) => {
    if (filter.stage && application.stage !== filter.stage) return false;
    if (!query) return true;
    return [
      application.companyName,
      application.roleTitle,
      application.location,
      application.source,
    ].some((value) => value?.toLocaleLowerCase().includes(query));
  });
}

function StageChip({
  stage,
  copy,
}: {
  stage: ApplicationStage;
  copy: Dictionary["applications"];
}) {
  return (
    <span className={`status-chip ${stageTone[stage]}`}>
      {copy.stages[stage]}
    </span>
  );
}

type DeleteApplication = (formData: FormData) => Promise<ApplicationActionState>;

/**
 * A table cannot drop a cell, so an empty one is marked rather than blank.
 *
 * The dash is typographic only and hidden from the accessibility tree: a
 * screen reader announcing "en dash" is worse than the empty cell it already
 * announces correctly, and the column header has already said what is missing.
 *
 * Deliberately not `sr-only` text alongside it. That class is
 * `position: absolute`, and with no positioned ancestor its containing block
 * is the viewport — so it escapes the table's `overflow-x: auto`, keeps its
 * static position 450px into an 820px-wide table, and widens the whole
 * document. On a 390px phone that is 51px of sideways drift on every page.
 */
function NoValue() {
  return <span aria-hidden="true">–</span>;
}

function ApplicationCard({
  application,
  deleteApplication,
  copy,
  common,
  locale,
}: {
  application: Application;
  deleteApplication: DeleteApplication;
  copy: Dictionary["applications"];
  common: Dictionary["common"];
  locale: AppLocale;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)] transition-transform hover:-translate-y-0.5 hover:border-[var(--ink-soft)]">
      <Link
        href={`/applications/${application.id}`}
        className="block p-4 focus-visible:outline-offset-[-3px]"
      >
        <span className="text-xs font-semibold text-[var(--ink-muted)]">
          {application.companyName}
        </span>
        <h3 className="mt-1 break-words text-sm font-semibold leading-5">
          {application.roleTitle}
        </h3>
        {/* Neither of these is guaranteed, and a line reading "Not specified · Not filled in"
            that costs a row and says nothing. If there is no place and no
            arrangement, the card simply does not carry that line. */}
        {application.location || application.workplaceMode !== "unspecified" ? (
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold text-[var(--ink-muted)]">
            {application.location ? <span>{application.location}</span> : null}
            {application.workplaceMode !== "unspecified" ? (
              <span>
                {application.location ? "· " : null}
                {copy.workplaceModes[application.workplaceMode]}
              </span>
            ) : null}
          </div>
        ) : null}
        <p className="mt-3 border-t border-[var(--line)] pt-2 text-xs font-semibold text-[var(--ink-muted)]">
          {copy.updatedOn.replace("{date}", formatDay(application.updatedAt, locale))}
        </p>
      </Link>
      <div className="px-4 pb-3">
        <ApplicationDeleteControl
          copy={copy}
          common={common}
          compact
          applicationId={application.id}
          companyName={application.companyName}
          roleTitle={application.roleTitle}
          deleteApplication={deleteApplication}
        />
      </div>
    </article>
  );
}

function EmptyApplications({
  copy,
}: {
  copy: Dictionary["applications"];
}) {
  return (
    <article className="soft-surface bg-[var(--sev-matched)] p-6 sm:p-8">
      <span className="status-chip bg-[var(--paper)]">{copy.emptyChip}</span>
      <h2 className="heading-font mt-4 text-2xl font-bold">{copy.emptyTitle}</h2>
      <p className="mt-2 max-w-xl type-caption font-medium text-[var(--ink-muted)]">
        {copy.emptyBody}
      </p>
      <Link
        href="/applications/new"
        className="button-primary mt-6 inline-flex min-h-11 items-center px-5 text-sm font-semibold"
      >
        {copy.createFirst}
      </Link>
    </article>
  );
}

export function ApplicationList({
  applications,
  view,
  deleteApplication,
  copy,
  common,
  locale,
}: {
  applications: Application[];
  view: "board" | "table";
  deleteApplication: DeleteApplication;
  copy: Dictionary["applications"];
  common: Dictionary["common"];
  locale: AppLocale;
}) {
  if (applications.length === 0) return <EmptyApplications copy={copy} />;

  // Neither wide view survives a phone: the table is 820px of six columns and
  // the board is 1780px of seven, so 390px of screen shows two and hides the
  // rest behind a sideways swipe. Below `md` the records stack as cards — the
  // same card the board already uses — and the board/table choice is a
  // desktop one, which is why the toggle is hidden there too.
  const phoneCards = (
    <div
      data-testid="application-cards"
      className="flex flex-col gap-3 md:hidden"
    >
      {applications.map((application) => (
        <ApplicationCard
          key={application.id}
          copy={copy}
          common={common}
          locale={locale}
          application={application}
          deleteApplication={deleteApplication}
        />
      ))}
    </div>
  );

  if (view === "table") {
    return (
      <>
        {phoneCards}
        <div
          data-testid="application-table"
          className="scroll-x-affordance overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--paper)] max-md:hidden"
        >
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="bg-[var(--canvas)] text-xs font-semibold text-[var(--ink-muted)]">
            <tr>
              {[
                copy.columns.role,
                copy.columns.location,
                copy.columns.stage,
                copy.columns.source,
                copy.columns.updated,
                copy.columns.actions,
              ].map((heading) => (
                <th key={heading} scope="col" className="border-b border-[var(--line)] px-4 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr key={application.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--canvas)]">
                <td className="px-4 py-4">
                  <Link href={`/applications/${application.id}`} className="font-semibold underline decoration-[var(--ink-soft)] underline-offset-4">
                    {application.companyName} · {application.roleTitle}
                  </Link>
                </td>
                <td className="px-4 py-4 font-medium text-[var(--ink-muted)]">
                  {application.location ?? <NoValue />}
                </td>
                <td className="px-4 py-4">
                  <StageChip stage={application.stage} copy={copy} />
                </td>
                <td className="px-4 py-4 font-medium text-[var(--ink-muted)]">
                  {application.source ?? <NoValue />}
                </td>
                <td className="px-4 py-4 font-medium text-[var(--ink-muted)]">
                  {formatDay(application.updatedAt, locale)}
                </td>
                <td className="min-w-56 px-4 py-4 align-top">
                  <ApplicationDeleteControl
                    copy={copy}
                    common={common}
                    compact
                    applicationId={application.id}
                    companyName={application.companyName}
                    roleTitle={application.roleTitle}
                    deleteApplication={deleteApplication}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </>
    );
  }

  // The board needs no second copy of anything: below `md` the seven columns
  // stack, which turns the sideways swipe into a vertical list still grouped
  // by stage — a better phone layout than the board is a phone table.
  return (
    <div
      data-testid="application-board"
      className="pb-4 md:scroll-x-affordance md:snap-columns md:overflow-x-auto"
    >
      <div className="grid gap-4 md:min-w-[1780px] md:grid-cols-7">
        {APPLICATION_STAGES.map((stage) => {
          const grouped = applications.filter(
            (application) => application.stage === stage,
          );
          if (grouped.length === 0) {
            return (
              <section key={stage} className="min-w-0 max-md:hidden">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
                  <h2 className="text-sm font-semibold">{copy.stages[stage]}</h2>
                  <span className="text-xs font-semibold tabular-nums text-[var(--ink-muted)]">0</span>
                </div>
              </section>
            );
          }
          return (
            <section
              key={stage}
              className="min-w-0"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
                <h2 className="text-sm font-semibold">{copy.stages[stage]}</h2>
                <span className="text-xs font-semibold tabular-nums text-[var(--ink-muted)]">
                  {grouped.length}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {grouped.map((application) => (
                  <ApplicationCard
                    key={application.id}
                    copy={copy}
                    common={common}
                    locale={locale}
                    application={application}
                    deleteApplication={deleteApplication}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
