import Link from "next/link";

import type { Dictionary } from "@/i18n/dictionaries/en";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none">
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none">
      <path d="m4.5 10.5 3.2 3.2 7.8-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The markup, separated from the language lookup for the same reason the app
 * shell is: `@/i18n/server` is server-only, and a page that imports it cannot
 * be rendered by a component test.
 */
export function HomeView({ dictionary }: { dictionary: Dictionary }) {
  const { common, landing } = dictionary;

  const workflow = [
    { index: "01", title: landing.workflow.oneTitle, detail: landing.workflow.oneBody },
    { index: "02", title: landing.workflow.twoTitle, detail: landing.workflow.twoBody },
    { index: "03", title: landing.workflow.threeTitle, detail: landing.workflow.threeBody },
  ];

  const requirements = [
    { label: landing.demo.growthExperiments, status: landing.demo.hasEvidence, tone: "mint" },
    { label: landing.demo.crossTeam, status: landing.demo.hasEvidence, tone: "blue" },
    { label: landing.demo.germanB2, status: landing.demo.needsConfirmation, tone: "yellow" },
  ];

  return (
    <main className="landing-shell min-h-screen overflow-hidden">
      <nav className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10" aria-label={common.productName}>
        <Link href="/" className="group flex items-center gap-3" aria-label={common.productName}>
          <span aria-hidden="true" className="logo-mark size-10" />
          <span className="heading-font text-xl font-semibold">{common.productName}</span>
          <span className="hidden rounded-full border border-[color:var(--ink-soft)] bg-[var(--paper)] px-2.5 py-1 type-eyebrow sm:inline">{landing.beta}</span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-medium text-[var(--ink-muted)] md:inline">{landing.navNote}</span>
          <Link href="/login" className="button-primary inline-flex min-h-11 items-center gap-2 px-4 text-sm font-semibold sm:px-5">
            {landing.signIn}
            <ArrowIcon />
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid w-full max-w-[1180px] gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[0.94fr_1.06fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-16">
        <div className="relative z-10 max-w-[620px]">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-2 text-sm font-semibold shadow-[var(--elevation-1)]">
            <span className="flex size-5 items-center justify-center rounded-full bg-[var(--paper)]"><CheckIcon /></span>
            {landing.badge}
          </div>

          <h1 className="type-display heading-font">
            {landing.headlineTop}
            <span className="mt-2 block">{landing.headlineBottom}</span>
          </h1>

          <p className="mt-7 max-w-[560px] text-lg font-medium leading-8 text-[var(--ink-muted)] sm:text-xl">
            {landing.body}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/login" className="button-primary inline-flex min-h-14 items-center justify-center gap-3 px-6 text-base font-semibold">
              {landing.primaryCta}
              <ArrowIcon />
            </Link>
            <a href="#how-it-works" className="button-secondary inline-flex min-h-14 items-center justify-center px-6 text-base font-semibold">
              {landing.secondaryCta}
            </a>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-[var(--ink-muted)]" aria-label={landing.navNote}>
            <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--sev-matched-ink)]" />{landing.principles.sourced}</li>
            <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--sev-minor-ink)]" />{landing.principles.explainable}</li>
            <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--sev-critical-ink)]" />{landing.principles.confirmed}</li>
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-[620px] lg:mx-0">
          <div className="soft-surface relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[var(--ink-muted)]">{landing.demo.workspace}</p>
                <p className="heading-font mt-1 text-xl font-semibold">{landing.demo.role}</p>
              </div>
              <div className="rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold">{landing.demo.pending}</div>
            </div>

            <div className="grid sm:grid-cols-[1fr_180px]">
              <div className="p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <p className="text-sm font-semibold">{landing.demo.requirements}</p>
                  <span className="text-xs font-bold text-[var(--ink-muted)]">{landing.demo.parsed}</span>
                </div>
                <div className="space-y-3">
                  {requirements.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--paper)]"><CheckIcon /></span>
                        <span className="truncate text-sm font-bold">{item.label}</span>
                      </div>
                      <span className={`status-chip status-${item.tone}`}>{item.status}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 border-t border-dashed border-[var(--ink-soft)] pt-5">
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sev-critical)] text-sm font-bold text-[var(--sev-critical-ink)]">AI</div>
                    <div>
                      <p className="text-sm font-semibold">{landing.demo.aiTitle}</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{landing.demo.aiBody}</p>
                    </div>
                  </div>
                </div>
              </div>

              <aside className="border-t border-[var(--line)] bg-[var(--canvas)] p-5 sm:border-l sm:border-t-0" aria-label={landing.demo.workspace}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{landing.demo.nextStep}</p>
                <p className="heading-font mt-2 text-lg font-semibold">{landing.demo.nextAction}</p>
                <div
                  className="mt-4 flex h-2 gap-1 overflow-hidden"
                  role="img"
                  aria-label={landing.demo.progressLabel}
                >
                  <span className="h-full flex-1 rounded-full bg-[var(--mint-strong)]" />
                  <span className="h-full flex-1 rounded-full bg-[var(--mint-strong)]" />
                  <span className="h-full flex-1 rounded-full bg-[var(--surface-muted)]" />
                </div>
                <p className="mt-2 text-xs font-bold text-[var(--ink-muted)]">{landing.demo.progressNote}</p>
                <button type="button" className="button-secondary mt-6 w-full px-3 py-2.5 text-sm font-semibold">{landing.demo.viewSuggestions}</button>
              </aside>
            </div>
          </div>

          <div className="absolute -right-3 -top-5 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-1.5 text-xs font-semibold shadow-[var(--elevation-1)] sm:right-8">{landing.demo.evidenceBadge}</div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-[var(--line)] bg-[var(--paper)]">
        <div className="mx-auto grid w-full max-w-[1180px] divide-y divide-[var(--line)] px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-10">
          {workflow.map((item) => (
            <article key={item.index} className="grid grid-cols-[auto_1fr] gap-4 py-7 md:px-6 md:first:pl-0 md:last:pr-0">
              <span className="heading-font text-sm font-semibold text-[var(--ink-muted)]">{item.index}</span>
              <div>
                <h2 className="heading-font text-lg font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm font-medium text-[var(--ink-muted)]">{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
