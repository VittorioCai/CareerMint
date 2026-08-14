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
    <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="dense-surface h-fit p-4 xl:sticky xl:top-24">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">档案分类</p>
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {Object.entries(labels).map(([type, label]) => (
            <li key={type} className="flex items-center justify-between gap-3 py-2.5 text-sm font-bold">
              <a href={`#facts-${type}`} className="underline-offset-4 hover:underline">{label}</a>
              <span className="rounded-full bg-[var(--canvas)] px-2 py-0.5 text-xs">{counts[type] ?? 0}</span>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0">
        <ManualFactForm createFact={createFactAction} />
        {facts.length === 0 ? (
          <div className="dense-surface mt-4 p-7 text-center">
            <p className="heading-font text-xl font-black">还没有职业事实</p>
            <p className="mt-2 text-sm font-medium text-[var(--ink-muted)]">上传简历自动提取，或手动添加第一条真实经历。</p>
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
                    <h2 className="heading-font text-lg font-black">{label}</h2>
                    <span className="text-xs font-black text-[var(--ink-muted)]">{groupedFacts.length} 条</span>
                  </div>
                  {groupedFacts.length > 0 ? (
                    <div className="overflow-hidden rounded-b-2xl border border-[var(--line)]">
                      {groupedFacts.map((fact) => (
                        <FactEditor key={fact.id} fact={fact} actions={actions} />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-b-2xl border border-[var(--line)] bg-white px-4 py-5 text-sm font-medium text-[var(--ink-muted)]">暂时没有这类事实。</p>
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
