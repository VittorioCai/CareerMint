import Link from "next/link";

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

const labels = {
  summary: "个人总结",
  work_experience: "工作经历",
  education: "教育",
  project: "项目",
  skill: "技能",
  certification: "证书",
  language: "语言",
  achievement: "量化成果",
  story: "STAR 故事",
} as const;

export function FactList({ facts }: { facts: CareerFact[] }) {
  const counts = Object.fromEntries(
    Object.keys(labels).map((type) => [
      type,
      facts.filter((fact) => fact.factType === type).length,
    ]),
  );
  const actions = {
    confirm: confirmFactAction,
    markNeedsDetail: markNeedsDetailAction,
    update: updateFactAction,
    remove: deleteFactAction,
  };

  return (
    <div
      className={`mt-6 grid min-w-0 gap-5 ${
        facts.length ? "xl:grid-cols-[230px_minmax(0,1fr)]" : ""
      }`}
    >
      {facts.length ? (
      <aside className="soft-surface h-fit p-4 xl:sticky xl:top-24">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">档案分类</p>
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {Object.entries(labels).map(([type, label]) => (
            <li key={type} className="flex items-center justify-between gap-3 py-2.5 text-sm font-medium">
              <a href={`#facts-${type}`} className="underline-offset-4 hover:underline">{label}</a>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  counts[type] ? "bg-[var(--canvas)]" : "text-[var(--ink-muted)]"
                }`}
              >
                {counts[type] ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </aside>
      ) : null}

      <div className="min-w-0">
        {facts.length ? <ManualFactForm createFact={createFactAction} /> : null}
        {facts.length === 0 ? (
          <div className="soft-surface mt-4 px-7 py-10 text-center">
            <p className="heading-font text-lg font-semibold">还没有职业事实</p>
            <p className="mx-auto mt-2 max-w-[42ch] type-caption text-[var(--ink-muted)]">
              上传一份简历，系统会提取出可确认的经历；也可以先手动写下第一条。分类会在有内容之后出现。
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Link
                href="/app"
                className="button-secondary press inline-flex min-h-11 items-center px-5 text-sm font-semibold"
              >
                去上传简历
              </Link>
              <ManualFactForm createFact={createFactAction} trigger="link" />
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {Object.entries(labels).map(([type, label]) => {
              const groupedFacts = facts.filter(
                (fact) => fact.factType === type,
              );
              return (
                <section key={type} id={`facts-${type}`} className="scroll-mt-24">
                  <div className="flex items-center justify-between gap-3 rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--canvas)] px-4 py-3">
                    <h2 className="heading-font text-lg font-semibold">{label}</h2>
                    <span className="text-xs font-semibold text-[var(--ink-muted)]">{groupedFacts.length} 条</span>
                  </div>
                  {groupedFacts.length > 0 ? (
                    <div className="overflow-hidden rounded-b-2xl border border-[var(--line)]">
                      {groupedFacts.map((fact) => (
                        <FactEditor key={fact.id} fact={fact} actions={actions} />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-b-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-5 text-sm font-medium text-[var(--ink-muted)]">暂时没有这类事实。</p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
