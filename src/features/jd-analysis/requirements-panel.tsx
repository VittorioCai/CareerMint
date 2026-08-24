"use client";

import Link from "next/link";
import { useState } from "react";

import {
  selectPriorityRequirements,
  summarizeRequirements,
} from "@/features/resume-gaps/schemas";

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

const matchLabels: Record<RequirementMatchStatus, string> = {
  evidence: "有证据",
  partial: "部分匹配",
  none: "没有证据",
  needs_user: "需要用户判断",
};

const matchSymbols: Record<RequirementMatchStatus, string> = {
  evidence: "✓",
  partial: "◐",
  none: "—",
  needs_user: "?",
};

type LocalView = "priority" | "all" | "source";

type DisclosureState = {
  datasetKey: string;
  openPriorityId: string | null;
  openAllIds: Set<string>;
  openCategories: Set<RequirementCategory>;
};

function emptyDisclosureState(datasetKey: string): DisclosureState {
  return {
    datasetKey,
    openPriorityId: null,
    openAllIds: new Set(),
    openCategories: new Set(),
  };
}

function statusClass(requirement: JDRequirementRecord) {
  if (requirement.matchStatus === "evidence") return "bg-[var(--mint)]";
  if (requirement.matchStatus === "partial") return "bg-[var(--mist-blue)]";
  if (requirement.matchStatus === "none" && requirement.priority === "core") {
    return "bg-[var(--coral)]";
  }
  if (requirement.matchStatus === "needs_user" && requirement.priority === "core") {
    return "bg-[var(--coral)]";
  }
  return "bg-white";
}

function isSafeExternalUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function StatusChip({ requirement }: { requirement: JDRequirementRecord }) {
  const label = matchLabels[requirement.matchStatus];
  return (
    <span
      className={`status-chip shrink-0 ${statusClass(requirement)}`}
      aria-label={`匹配状态：${label}`}
    >
      <span aria-hidden="true">{matchSymbols[requirement.matchStatus]} </span>
      {label}
    </span>
  );
}

function RequirementDisclosure({
  requirement,
  expanded,
  onToggle,
}: {
  requirement: JDRequirementRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const detailId = `requirement-detail-${requirement.id}`;
  return (
    <article className="border-b border-[var(--line)] bg-white last:border-b-0">
      <button
        type="button"
        className="flex min-h-16 w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-[var(--canvas)] sm:items-center sm:px-4"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-black leading-6">
            {requirement.text}
          </span>
          <span className="mt-0.5 block text-[11px] font-bold text-[var(--ink-muted)]">
            {requirement.priority === "core" ? "核心要求" : "补充要求"}
          </span>
        </span>
        <StatusChip requirement={requirement} />
        <span aria-hidden="true" className="pt-1 text-sm text-[var(--ink-muted)]">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded ? (
        <div id={detailId} className="border-t border-[var(--line)] px-4 pb-4 pt-3 sm:px-5">
          {requirement.matchReason ? (
            <section>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                匹配理由
              </p>
              <p className="mt-1 text-sm font-medium leading-6 text-[var(--ink-muted)]">
                {requirement.matchReason}
              </p>
            </section>
          ) : null}

          {requirement.evidence.length > 0 ? (
            <section className={requirement.matchReason ? "mt-4" : undefined}>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                已确认职业事实及来源
              </p>
              <div className="mt-2 grid gap-3">
                {requirement.evidence.map((fact) => (
                  <div key={fact.id} className="border-t border-[var(--line)] pt-3 first:border-t-0 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-black">{fact.title}</p>
                      <Link
                        href="/profile"
                        className="min-h-8 text-[11px] font-black underline underline-offset-4"
                      >
                        查看职业档案
                      </Link>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-5 text-[var(--ink-muted)]">
                      {fact.description}
                    </p>
                    {fact.sourceExcerpt ? (
                      <blockquote className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-3 py-2 text-[11px] font-medium leading-5 text-[var(--ink-muted)]">
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
            </section>
          ) : null}

          <section className={requirement.matchReason || requirement.evidence.length > 0 ? "mt-4" : undefined}>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              JD 来源摘录
            </p>
            <blockquote className="mt-1 whitespace-pre-wrap break-words text-xs font-medium leading-5 text-[var(--ink-muted)]">
              {requirement.sourceExcerpt}
            </blockquote>
          </section>
        </div>
      ) : null}
    </article>
  );
}

function CategoryHeader({
  label,
  requirements,
  expanded,
  onToggle,
}: {
  label: string;
  requirements: JDRequirementRecord[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusCounts = requirements.reduce<Record<string, number>>((counts, requirement) => {
    counts[requirement.matchStatus] = (counts[requirement.matchStatus] ?? 0) + 1;
    return counts;
  }, {});
  const countText = [
    `${statusCounts.evidence ?? 0} 有证据`,
    `${statusCounts.partial ?? 0} 部分匹配`,
    `${statusCounts.none ?? 0} 没有证据`,
    `${statusCounts.needs_user ?? 0} 需判断`,
  ].join(" · ");

  return (
    <button
      type="button"
      className="flex min-h-14 w-full items-center gap-3 border-b border-[var(--line)] bg-white px-4 py-3 text-left hover:bg-[var(--canvas)]"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span aria-hidden="true" className="text-sm text-[var(--ink-muted)]">
        {expanded ? "⌄" : "›"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black">{label}</span>
        <span className="mt-0.5 block break-words text-[11px] font-bold text-[var(--ink-muted)]">
          {requirements.length} 项 · {countText}
        </span>
      </span>
    </button>
  );
}

export function RequirementsPanel({
  requirements,
  analysisRunId,
  sourceText,
  sourceUrl,
}: {
  requirements: JDRequirementRecord[];
  analysisRunId?: string | null;
  sourceText: string;
  sourceUrl?: string | null;
}) {
  const [view, setView] = useState<LocalView>("priority");
  const runKey = analysisRunId ?? requirements[0]?.analysisRunId ?? "empty-analysis";
  const requirementsFingerprint = requirements.map((requirement) => requirement.id).join(",");
  const datasetKey = `${runKey}:${requirementsFingerprint}`;
  const [disclosure, setDisclosure] = useState<DisclosureState>(() =>
    emptyDisclosureState(datasetKey),
  );

  if (disclosure.datasetKey !== datasetKey) {
    setDisclosure(emptyDisclosureState(datasetKey));
  }

  const { openPriorityId, openAllIds, openCategories } = disclosure;

  const summary = summarizeRequirements(requirements);
  const priorityRequirements = selectPriorityRequirements(requirements)
    .map((selected) => requirements.find((requirement) => requirement.id === selected.id))
    .filter((requirement): requirement is JDRequirementRecord => Boolean(requirement));
  const safeSourceUrl =
    typeof sourceUrl === "string" && isSafeExternalUrl(sourceUrl) ? sourceUrl : null;

  function changeView(nextView: LocalView) {
    setView(nextView);
    setDisclosure((current) => ({
      ...current,
      openPriorityId: null,
      openAllIds: new Set(),
      openCategories: new Set(),
    }));
  }

  function toggleAllRequirement(id: string) {
    setDisclosure((current) => {
      const next = new Set(current.openAllIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...current, openAllIds: next };
    });
  }

  function toggleCategory(category: RequirementCategory) {
    setDisclosure((current) => {
      const next = new Set(current.openCategories);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return { ...current, openCategories: next };
    });
  }

  const viewButtons: Array<{ value: LocalView; label: string }> = [
    { value: "priority", label: "重点" },
    { value: "all", label: "全部要求" },
    { value: "source", label: "JD 原文" },
  ];

  return (
    <div className="space-y-5">
      <section aria-labelledby="jd-summary-heading" className="dense-surface overflow-hidden">
        <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            结构化结果
          </p>
          <h2 id="jd-summary-heading" className="heading-font mt-1 text-2xl font-black">
            JD 要求摘要
          </h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
            先看重点，需要时再展开职业事实和原文依据。
          </p>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          {[
            ["总要求", summary.total],
            ["核心要求", summary.core],
            ["有证据", summary.evidence],
            ["需要关注", summary.attention],
          ].map(([label, value], index) => (
            <div
              key={label}
              role="group"
              aria-label={`${label} ${value}`}
              className={`px-4 py-3 sm:px-5 ${index % 2 === 1 ? "border-l border-[var(--line)]" : ""} ${index >= 2 ? "border-t border-[var(--line)]" : ""} sm:border-t-0 ${index > 0 ? "sm:border-l sm:border-[var(--line)]" : "sm:border-l-0"}`}
            >
              <dt className="text-[11px] font-black text-[var(--ink-muted)]">{label}</dt>
              <dd className="mt-1 text-xl font-black">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex flex-wrap gap-2" aria-label="JD 视图">
        {viewButtons.map((button) => (
          <button
            key={button.value}
            type="button"
            className={`min-h-10 rounded-xl border px-4 py-2 text-sm font-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mist-blue)] ${view === button.value ? "border-[var(--ink)] bg-[var(--cream)]" : "border-[var(--line)] bg-white hover:bg-[var(--canvas)]"}`}
            aria-pressed={view === button.value}
            onClick={() => changeView(button.value)}
          >
            {button.label}
          </button>
        ))}
      </div>

      {view === "priority" ? (
        <section className="dense-surface overflow-hidden" aria-label="重点要求">
          <div className="border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <h3 className="text-sm font-black">重点要求</h3>
            <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">
              按核心缺口和待判断事项排序，最多显示五条。
            </p>
          </div>
          {priorityRequirements.length > 0 ? (
            priorityRequirements.map((requirement) => (
              <RequirementDisclosure
                key={requirement.id}
                requirement={requirement}
                expanded={openPriorityId === requirement.id}
                onToggle={() =>
                  setDisclosure((current) => ({
                    ...current,
                    openPriorityId:
                      current.openPriorityId === requirement.id
                        ? null
                        : requirement.id,
                  }))
                }
              />
            ))
          ) : (
            <div className="border-t border-dashed border-[var(--ink-soft)] bg-white p-6 text-center">
              <h4 className="heading-font text-lg font-black">还没有结构化要求</h4>
              <p className="mt-2 text-sm font-medium text-[var(--ink-muted)]">
                点击上方“开始分析 JD”，系统会整理要求并只匹配已确认事实。
              </p>
            </div>
          )}
        </section>
      ) : null}

      {view === "all" ? (
        <section className="dense-surface overflow-hidden" aria-label="全部要求">
          <div className="border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <h3 className="text-sm font-black">全部要求</h3>
            <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">
              按类别浏览，分类和要求默认闭合。
            </p>
          </div>
          {requirements.length > 0 ? categories.map((category) => {
            const grouped = requirements.filter(
              (requirement) => requirement.category === category.value,
            );
            if (grouped.length === 0) return null;
            const expanded = openCategories.has(category.value);
            return (
              <div key={category.value} className="border-b border-[var(--line)] last:border-b-0">
                <CategoryHeader
                  label={category.label}
                  requirements={grouped}
                  expanded={expanded}
                  onToggle={() => toggleCategory(category.value)}
                />
                {expanded
                  ? grouped.map((requirement) => (
                      <RequirementDisclosure
                        key={requirement.id}
                        requirement={requirement}
                        expanded={openAllIds.has(requirement.id)}
                        onToggle={() => toggleAllRequirement(requirement.id)}
                      />
                    ))
                  : null}
              </div>
            );
          }) : (
            <p className="border-t border-[var(--line)] px-4 py-5 text-sm font-medium text-[var(--ink-muted)]">
              分析完成后，这里会按类别显示全部要求。
            </p>
          )}
        </section>
      ) : null}

      {view === "source" ? (
        <article className="dense-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                不可变快照
              </p>
              <h3 className="heading-font mt-1 text-xl font-black">JD 原文</h3>
            </div>
            {safeSourceUrl ? (
              <a
                href={safeSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="button-secondary inline-flex min-h-10 items-center px-4 text-xs font-black"
              >
                打开原岗位 ↗
              </a>
            ) : null}
          </div>
          <div className="whitespace-pre-wrap break-words px-4 py-5 text-sm font-medium leading-7 text-[var(--ink-muted)] sm:px-5">
            {sourceText.trim() ? sourceText : "没有保存的 JD 原文"}
          </div>
        </article>
      ) : null}
    </div>
  );
}
