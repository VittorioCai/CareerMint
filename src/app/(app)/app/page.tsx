import Link from "next/link";
import { redirect } from "next/navigation";

import { getOwnedProfile } from "@/features/account/repository";
import { dashboardJDActionLabel } from "@/features/applications/dashboard-copy";
import { applicationRepository } from "@/features/applications/repository";
import { summarizeApplications } from "@/features/applications/summary";
import { careerFactRepository } from "@/features/career-profile/repository";
import { listOwnedJobs } from "@/features/jobs/repository";
import { listAssets } from "@/features/source-assets/repository";
import { DashboardUpload } from "@/features/source-assets/dashboard-upload";
import { getDictionary } from "@/i18n/server";
import { requireUser } from "@/lib/auth/require-user";

export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await getOwnedProfile(user.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");

  const [assets, facts, jobs, applications] = await Promise.all([
    listAssets(user.id),
    careerFactRepository.list(user.id),
    listOwnedJobs(user.id),
    applicationRepository.list(user.id),
  ]);

  const activeJob = jobs.find(
    (job) => job.status === "queued" || job.status === "running",
  );
  const pendingFacts = facts.filter(
    (fact) => fact.confirmationStatus !== "confirmed",
  );
  const confirmedCount = facts.length - pendingFacts.length;
  const applicationSummary = summarizeApplications(applications);
  const { applications: appsCopy, home } = await getDictionary();

  let primaryState;
  if (assets.length === 0) {
    primaryState = (
      <article className="soft-surface bg-[var(--paper)] p-5 sm:p-7">
        <span className="status-chip severity-important">{home.firstStep}</span>
        <h2 className="heading-font mt-4 text-2xl font-bold">{home.uploadTitle}</h2>
        <p className="mt-2 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
          {home.uploadBody}
        </p>
        <div className="mt-6 max-w-2xl">
          <DashboardUpload />
        </div>
      </article>
    );
  } else if (activeJob || assets.some((asset) => asset.status === "extracting")) {
    primaryState = (
      <article className="soft-surface bg-[var(--paper)] p-6 sm:p-8">
        <span className="status-chip severity-minor">{home.processing}</span>
        <h2 className="heading-font mt-4 text-2xl font-bold">{home.processingTitle}</h2>
        <p className="mt-2 max-w-xl type-caption font-medium text-[var(--ink-muted)]">
          {home.processingBody}
        </p>
        <progress className="mt-6 h-2 w-full max-w-xl accent-[var(--ink)]" />
        <Link href="/applications" className="button-secondary mt-6 inline-flex min-h-11 items-center px-5 text-sm font-semibold">
          {home.seeApplications}
        </Link>
      </article>
    );
  } else if (pendingFacts.length > 0) {
    primaryState = (
      <article className="soft-surface bg-[var(--paper)] p-6 sm:p-8">
        <span className="status-chip bg-[var(--sev-critical)] text-[var(--sev-critical-ink)]">{home.needsYou}</span>
        <h2 className="heading-font mt-4 text-2xl font-bold">{home.reviewTitle}</h2>
        <p className="mt-2 max-w-xl type-caption font-medium text-[var(--ink-muted)]">
          {home.reviewBody.replace("{count}", String(pendingFacts.length))}
        </p>
        <div className="mt-5 h-3 max-w-xl overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div className="h-full bg-[var(--sev-matched)]" style={{ width: `${facts.length ? (confirmedCount / facts.length) * 100 : 0}%` }} />
        </div>
        <Link href="/profile" className="button-primary mt-6 inline-flex min-h-11 items-center px-5 text-sm font-semibold">
          {home.reviewCta}
        </Link>
      </article>
    );
  } else {
    primaryState = (
      <article className="soft-surface bg-[var(--sev-matched)] p-6 sm:p-8">
        <span className="status-chip bg-[var(--paper)]">{home.checked}</span>
        <h2 className="heading-font mt-4 text-3xl font-bold">{home.readyTitle}</h2>
        <p className="mt-2 max-w-xl type-caption font-medium text-[var(--ink-muted)]">
          {home.readyBody.replace("{count}", String(confirmedCount))}
        </p>
        <Link href="/applications/new" className="button-primary mt-6 inline-flex min-h-11 items-center px-5 text-sm font-semibold">
          {dashboardJDActionLabel(applications.length, appsCopy)} →
        </Link>
      </article>
    );
  }

  return (
    <section className="min-w-0">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{home.eyebrow}</p>
        <h1 className="heading-font mt-2 break-words type-page-title">
          {profile.displayName
            ? home.greeting.replace("{name}", profile.displayName)
            : home.greetingNoName}
        </h1>
        <p className="mt-3 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
          {profile.targetRole
            ? home.currentTarget.replace("{role}", profile.targetRole)
            : home.noTarget}
        </p>
      </div>
      <div className="mt-8">{primaryState}</div>

      <section className="mt-10" aria-labelledby="application-progress-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              {home.recordsEyebrow}
            </p>
            <h2 id="application-progress-heading" className="heading-font mt-1 text-2xl font-bold">
              {home.recordsTitle}
            </h2>
          </div>
          <Link href="/applications" className="text-action text-sm font-semibold underline decoration-[var(--ink-soft)] underline-offset-4">
            {home.seeAll}
          </Link>
        </div>

          {applicationSummary.total > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [home.stats.total, applicationSummary.total, home.stats.totalNote],
              [home.stats.active, applicationSummary.active, home.stats.activeNote],
              [home.stats.interviews, applicationSummary.interviews, home.stats.currentStage],
              [home.stats.offers, applicationSummary.offers, home.stats.currentStage],
            ].map(([label, value, note], index) => (
              <article
                key={label}
                className={`rounded-2xl border p-4 ${
                  index === 0
                    ? "border-[var(--line)] bg-[var(--surface-muted)]"
                    : "border-[var(--line)] bg-[var(--paper)]"
                }`}
              >
                <p className="text-xs font-semibold text-[var(--ink-muted)]">{label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">{note}</p>
              </article>
            ))}
          </div>
          ) : null}

        {applicationSummary.recent.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)]">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <h3 className="text-sm font-semibold">{home.recent}</h3>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {applicationSummary.recent.map((application) => (
                <li key={application.id}>
                  <Link href={`/applications/${application.id}`} className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-[var(--canvas)]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{application.companyName}</span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--ink-muted)]">{application.roleTitle}</span>
                    </span>
                    <span className="status-chip bg-[var(--sev-minor)]">
                      {appsCopy.stages[application.stage]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <article className="mt-5 rounded-2xl border border-dashed border-[var(--ink-soft)] bg-[var(--paper)] p-5">
            <p className="text-sm font-bold">{home.noRecords}</p>
            <Link href="/applications/new" className="mt-3 inline-flex text-sm font-semibold underline underline-offset-4">
              {home.createWorkspace}
            </Link>
          </article>
        )}
      </section>

      <p className="mt-7 text-xs font-medium leading-5 text-[var(--ink-muted)]">
        {home.dataNote}
      </p>
    </section>
  );
}
