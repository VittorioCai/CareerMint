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
import { ManualFactForm } from "./manual-fact-form";
import type { CareerFact } from "./schemas";

export function FactList({
  facts,
  copy,
  common,
}: {
  facts: CareerFact[];
  copy: Dictionary["profile"];
  common: Dictionary["common"];
}) {
  // Only the categories that have something in them. Nine sections for one
  // fact meant eight boxes reading 暂时没有这类事实 — a placeholder rendered as
  // content, contradicting the empty state's own promise that categories
  // appear once there is something to put in them.
  const groups = Object.entries(copy.types)
    .map(([type, label]) => ({
      type,
      label,
      facts: facts.filter((fact) => fact.factType === type),
    }))
    .filter((group) => group.facts.length > 0);
  const actions = {
    confirm: confirmFactAction,
    markNeedsDetail: markNeedsDetailAction,
    update: updateFactAction,
    remove: deleteFactAction,
  };

  return (
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
        {facts.length ? <ManualFactForm createFact={createFactAction} copy={copy} /> : null}
        {facts.length === 0 ? (
          <div className="soft-surface mt-4 px-7 py-10 text-center">
            <p className="heading-font text-lg font-semibold">{copy.emptyTitle}</p>
            <p className="mx-auto mt-2 max-w-[42ch] type-caption text-[var(--ink-muted)]">
              {copy.emptyBody}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Link
                href="/app"
                className="button-secondary press inline-flex min-h-11 items-center px-5 text-sm font-semibold"
              >
                {copy.goUpload}
              </Link>
              <ManualFactForm createFact={createFactAction} copy={copy} trigger="link" />
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
  );
}
