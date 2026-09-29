import Link from "next/link";

import type { Dictionary } from "@/i18n/dictionaries/en";

import {
  confirmFactAction,
  createFactAction,
  deleteFactAction,
  markNeedsDetailAction,
  updateFactAction,
} from "./actions";
import { FactEditor } from "./fact-editor";
import { FactReceiptProvider, FactReceiptRegion } from "./fact-receipt";
import { ManualFactForm } from "./manual-fact-form";
import type { CareerFact } from "./schemas";

export const FACT_FILTERS = ["all", "open", "confirmed"] as const;

export type FactFilter = (typeof FACT_FILTERS)[number];

/** Anything that is not a filter is "all", including nothing at all. */
export function resolveFactFilter(value: unknown): FactFilter {
  return FACT_FILTERS.includes(value as FactFilter)
    ? (value as FactFilter)
    : "all";
}

function isOpen(fact: CareerFact) {
  return fact.confirmationStatus !== "confirmed";
}

export function FactList({
  facts,
  copy,
  common,
  filter = "all",
}: {
  facts: CareerFact[];
  copy: Dictionary["profile"];
  common: Dictionary["common"];
  filter?: FactFilter;
}) {
  const counts: Record<FactFilter, number> = {
    all: facts.length,
    open: facts.filter(isOpen).length,
    confirmed: facts.filter((fact) => !isOpen(fact)).length,
  };
  const visible =
    filter === "all"
      ? facts
      : facts.filter((fact) => isOpen(fact) === (filter === "open"));

  // Only the categories that have something in them. Nine sections for one
  // fact meant eight boxes reading 暂时没有这类事实 — a placeholder rendered as
  // content, contradicting the empty state's own promise that categories
  // appear once there is something to put in them.
  const groups = Object.entries(copy.types)
    .map(([type, label]) => ({
      type,
      label,
      // What still needs a decision comes first. The sort is stable, so
      // within each half the order is the one the facts arrived in.
      facts: visible
        .filter((fact) => fact.factType === type)
        .sort((left, right) => Number(isOpen(right)) - Number(isOpen(left))),
    }))
    .filter((group) => group.facts.length > 0);
  const actions = {
    confirm: confirmFactAction,
    markNeedsDetail: markNeedsDetailAction,
    update: updateFactAction,
    remove: deleteFactAction,
  };

  return (
    <FactReceiptProvider>
    <div
      className={`mt-6 grid min-w-0 gap-5 ${
        groups.length > 1 ? "xl:grid-cols-[230px_minmax(0,1fr)]" : ""
      }`}
    >
      {/* An index of one entry is not an index — it is the heading below it,
          printed twice. */}
      {groups.length > 1 ? (
      <nav className="soft-surface h-fit p-4 xl:sticky xl:top-24" aria-label={copy.index}>
        <p className="type-eyebrow text-[var(--ink-muted)]">{copy.index}</p>
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {groups.map((group) => (
            <li key={group.type} className="flex items-center justify-between gap-3 py-2.5 text-sm font-medium">
              <a href={`#facts-${group.type}`} className="text-action underline-offset-4 hover:underline">{group.label}</a>
              <span className="rounded-full bg-[var(--canvas)] px-2 py-0.5 text-xs font-semibold">
                {group.facts.length}
              </span>
            </li>
          ))}
        </ul>
      </nav>
      ) : null}

      <div className="min-w-0">
        <FactReceiptRegion dismissLabel={copy.dismissReceipt} />
        {facts.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ManualFactForm createFact={createFactAction} copy={copy} common={common} />
            {/* Links, not buttons: the filter is part of the address, so it
                survives a reload and the revalidation that follows every
                change to a fact. */}
            <nav aria-label={copy.filter.label} className="flex items-center gap-1">
              {FACT_FILTERS.map((option) => (
                <Link
                  key={option}
                  href={option === "all" ? "/profile" : `/profile?status=${option}`}
                  aria-current={option === filter ? "page" : undefined}
                  className={`segment gap-1.5 text-xs ${
                    option === filter
                      ? "bg-[var(--surface-muted)] font-semibold"
                      : "font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {copy.filter[option]}
                  <span className="tabular-nums">{counts[option]}</span>
                </Link>
              ))}
            </nav>
          </div>
        ) : null}
        {facts.length > 0 && visible.length === 0 ? (
          <p className="soft-surface mt-4 px-6 py-8 text-center type-caption text-[var(--ink-muted)]">
            {copy.filterEmpty}
          </p>
        ) : null}
        {facts.length === 0 ? (
          <div className="soft-surface mt-4 px-7 py-10 text-center">
            <p className="heading-font text-lg font-semibold">{copy.emptyTitle}</p>
            <p className="mx-auto mt-2 type-caption text-[var(--ink-muted)]">
              {copy.emptyBody}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              {/* The recommended way in, so it is the primary button. It was
                  the grey one, on a page whose only other button — adding a
                  fact by hand, once there are facts — was the black one. */}
              <Link
                href="/app"
                className="button-primary press inline-flex min-h-11 items-center px-5 text-sm font-semibold"
              >
                {copy.goUpload}
              </Link>
              <ManualFactForm
                createFact={createFactAction}
                copy={copy}
                common={common}
                trigger="link"
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map((group) => (
              <section key={group.type} id={`facts-${group.type}`} className="scroll-mt-24">
                <div className="flex items-center justify-between gap-3 rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--canvas)] px-4 py-3">
                  <h2 className="heading-font text-lg font-semibold">{group.label}</h2>
                  <span className="text-xs font-semibold text-[var(--ink-muted)]">{group.facts.length} {copy.countSuffix}</span>
                </div>
                <div className="overflow-hidden rounded-b-2xl border border-[var(--line)]">
                  {group.facts.map((fact) => (
                    <FactEditor
                      key={fact.id}
                      fact={fact}
                      actions={actions}
                      copy={copy}
                      common={common}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
    </FactReceiptProvider>
  );
}
