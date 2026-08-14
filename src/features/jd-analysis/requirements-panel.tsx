import Link from "next/link";

import type {
  JDRequirementRecord,
  RequirementCategory,
  RequirementMatchStatus,
} from "./schemas";

const categories: Array<{
  value: RequirementCategory;
  label: string;
}> = [
  { value: "responsibility", label: "核心职责" },
  { value: "hard_requirement", label: "硬性要求" },
  { value: "preferred", label: "加分项" },
  { value: "skill", label: "技能关键词" },
  {
    value: "language_work_authorization",
    label: "语言与工作许可",
  },
  { value: "location_workplace", label: "地点与办公方式" },
  { value: "compensation", label: "薪资与待遇" },
];

const matchPresentation: Record<
  RequirementMatchStatus,
  { label: string; className: string; symbol: string }
> = {
  evidence: {
    label: "有证据",
    className: "bg-[var(--mint)]",
    symbol: "✓",
  },
  partial: {
    label: "部分匹配",
    className: "bg-[var(--cream)]",
    symbol: "◐",
  },
  none: {
    label: "没有证据",
    className: "bg-[#fff0ee]",
    symbol: "—",
  },
  needs_user: {
    label: "需要用户判断",
    className: "bg-[var(--mist-blue)]",
    symbol: "?",
  },
};

function RequirementCard({
  requirement,
}: {
  requirement: JDRequirementRecord;
}) {
  const presentation = matchPresentation[requirement.matchStatus];
  return (
    <article className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black leading-6">{requirement.text}</p>
          <p className="mt-1 text-[11px] font-bold text-[var(--ink-muted)]">
            {requirement.priority === "core" ? "核心要求" : "补充要求"}
          </p>
        </div>
        <span
          className={`status-chip shrink-0 ${presentation.className}`}
          aria-label={`匹配状态：${presentation.label}`}
        >
          <span aria-hidden="true">{presentation.symbol} </span>
          {presentation.label}
        </span>
      </div>

      {requirement.matchReason ? (
        <p className="mt-3 text-sm font-medium leading-6 text-[var(--ink-muted)]">
          {requirement.matchReason}
        </p>
      ) : null}

      {requirement.evidence.length > 0 ? (
        <div className="mt-4 grid gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            已确认事实证据
          </p>
          {requirement.evidence.map((fact) => (
            <div
              key={fact.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black">{fact.title}</p>
                <Link
                  href="/profile"
                  className="text-[11px] font-black underline underline-offset-4"
                >
                  查看职业档案
                </Link>
              </div>
              <p className="mt-1 text-xs font-medium leading-5 text-[var(--ink-muted)]">
                {fact.description}
              </p>
              {fact.sourceExcerpt ? (
                <blockquote className="mt-2 border-l-2 border-[var(--mint)] pl-3 text-[11px] font-medium text-[var(--ink-muted)]">
                  {fact.sourceExcerpt}
                </blockquote>
              ) : (
                <p className="mt-2 text-[11px] font-bold text-[var(--ink-muted)]">
                  来源：用户手动确认
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <details className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-3 py-2">
        <summary className="cursor-pointer text-xs font-black">
          JD 原文证据
        </summary>
        <blockquote className="mt-2 text-xs font-medium leading-5 text-[var(--ink-muted)]">
          {requirement.sourceExcerpt}
        </blockquote>
      </details>
    </article>
  );
}

export function RequirementsPanel({
  requirements,
}: {
  requirements: JDRequirementRecord[];
}) {
  if (requirements.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--ink-soft)] bg-white p-6 text-center">
        <h3 className="heading-font text-lg font-black">还没有结构化要求</h3>
        <p className="mt-2 text-sm font-medium text-[var(--ink-muted)]">
          点击上方“开始分析 JD”，系统会整理要求并只匹配已确认事实。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            结构化结果
          </p>
          <h2 className="heading-font mt-1 text-2xl font-black">
            {requirements.length} 项岗位要求
          </h2>
        </div>
        <p className="max-w-sm text-xs font-semibold leading-5 text-[var(--ink-muted)]">
          “没有证据”不代表你不具备，只表示当前已确认职业档案里没有可引用依据。
        </p>
      </div>

      {categories.map((category) => {
        const grouped = requirements.filter(
          (requirement) => requirement.category === category.value,
        );
        if (grouped.length === 0) return null;
        return (
          <section key={category.value}>
            <h3 className="heading-font text-xl font-black">
              {category.label}
              <span
                aria-hidden="true"
                className="ml-2 text-sm text-[var(--ink-muted)]"
              >
                {grouped.length}
              </span>
            </h3>
            <div className="mt-3 grid gap-3">
              {grouped.map((requirement) => (
                <RequirementCard
                  key={requirement.id}
                  requirement={requirement}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
