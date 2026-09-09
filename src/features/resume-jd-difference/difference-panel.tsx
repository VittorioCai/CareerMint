import Link from "next/link";
import type { ReactNode } from "react";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import type { ResumeJDDifferenceRun } from "./repository";
import type { DifferenceIssue, ResumeJDDifferenceOutput } from "./schemas";

export type ResumeJDDifferencePanelProps = {
  applicationId: string;
  run: ResumeJDDifferenceRun | null;
  facts: ConfirmedFactForAnalysis[];
  /**
   * The analysis control. It lives inside this panel's sticker rather than
   * beside it: "start the analysis" and "here is what it found" are two states
   * of one object, and rendering them as two cards made the page open with two
   * competing headers.
   */
  control?: ReactNode;
  stale?: boolean;
};

const typeCopy: Record<DifferenceIssue["type"], string> = {
  missing: "未覆盖",
  language_misaligned: "岗位语言未对齐",
  profile_only: "仅职业档案有证据",
  skill_only: "只在技能区出现",
  too_vague: "表述过于笼统",
  missing_context: "缺少场景",
  missing_result: "缺少结果",
  needs_confirmation: "需要本人确认",
  gate: "岗位门槛",
};

function safeCopy(value: string) {
  return value
    .replaceAll("你不具备", "当前材料未找到相关证据")
    .replaceAll("用户不具备", "当前材料未找到相关证据");
}

function resumeEvidence(row: {
  resumeExcerpt: string | null;
  unsupported: boolean;
}) {
  if (!row.resumeExcerpt || row.unsupported) {
    return "当前材料未找到相关证据";
  }
  return row.resumeExcerpt;
}

// Ids can outlive the fact they point at, so only facts the profile still has
// are named. See the same resolver in improvement-panel.tsx.
function resolveCitedFacts(
  profileFactIds: readonly string[],
  factsById: Map<string, ConfirmedFactForAnalysis>,
) {
  return profileFactIds
    .map((id) => factsById.get(id))
    .filter((fact): fact is ConfirmedFactForAnalysis => fact !== undefined);
}

function IssueDetails({
  row,
  citedFacts,
}: {
  row: PanelRow;
  citedFacts: ConfirmedFactForAnalysis[];
}) {
  return (
    <details className="reveal group" data-testid={`difference-issue-${row.id}`}>
      <span
        aria-hidden="true"
        className={`severity-band mx-4 mb-1 mt-2.5 block ${severityBandClass[row.severity]}`}
      />
      <summary className="flex cursor-pointer list-none items-start gap-4 rounded-2xl px-4 py-3.5 marker:hidden focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--mist-blue)] group-open:bg-[var(--paper)]">
        <span
          aria-hidden="true"
          data-testid="row-badge"
          className={`badge-index heading-font mt-0.5 ${badgeVariant[row.severity]}`}
        >
          {row.badgeMark}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span
              data-testid="row-priority"
              className={`severity-chip ${severityChipClass[row.severity]}`}
            >
              {severityLabel[row.severity]}
            </span>
            <span
              data-testid="row-type"
              className="text-xs font-semibold text-[var(--ink-muted)]"
            >
              {row.typeLabel}
            </span>
          </span>
          <span className="mt-2 block max-w-[64ch] text-base font-bold leading-[1.55]">
            {safeCopy(row.jdTranslationZh)}
          </span>
          {/* A requirement can quote a whole paragraph. Unclamped it runs
              three lines of grey English above the Chinese judgement it is
              supposed to support; the full text is in the panel below. */}
          <span
            className="mt-1.5 line-clamp-2 block max-w-[70ch] break-words text-[13.5px] font-normal italic leading-[1.6] text-[var(--ink-muted)]"
            lang="und"
          >
            “{row.jdOriginal}”
          </span>
        </span>
        <span
          aria-hidden="true"
          className="mt-1 grid size-7 shrink-0 place-items-center rounded-full text-[var(--ink-muted)] transition-transform group-open:rotate-180"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </span>
      </summary>
      <div className="mb-2.5 ml-[58px] mr-2 rounded-2xl bg-[var(--canvas)] px-5 py-4">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-8 gap-y-5">
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              岗位原文
            </dt>
            <dd
              className="mt-2 break-words text-sm font-normal leading-[1.65] text-[var(--ink-muted)]"
              lang="und"
            >
              {row.jdOriginal}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              简历现状
            </dt>
            <dd className="mt-2 text-sm font-medium leading-[1.65]">
              <span className="block">{safeCopy(row.resumeStatusZh)}</span>
              <span className="mt-2 block rounded-xl bg-white px-3 py-2 font-normal text-[var(--ink-muted)]" lang="und">
                {resumeEvidence(row)}
              </span>
            </dd>
          </div>
          {row.problemZh ? (
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                问题点
              </dt>
              <dd className="mt-2 text-sm font-medium leading-[1.65]">
                {safeCopy(row.problemZh)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              判断依据
            </dt>
            <dd className="mt-2 text-sm font-medium leading-[1.65]">
              {safeCopy(row.reasonZh)}
            </dd>
          </div>
          {citedFacts.length ? (
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                档案依据
              </dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {citedFacts.map((fact) => (
                  <span
                    key={fact.id}
                    className="rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-semibold"
                    title={fact.organization ? `${fact.title} · ${fact.organization}` : fact.title}
                  >
                    {fact.title}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </details>
  );
}

type RowSeverity = "critical" | "gate" | "important" | "minor" | "matched";

type PanelRow = {
  id: string;
  severity: RowSeverity;
  badgeMark: string;
  typeLabel: string;
  jdOriginal: string;
  jdTranslationZh: string;
  resumeStatusZh: string;
  resumeExcerpt: string | null;
  unsupported: boolean;
  problemZh: string | null;
  reasonZh: string;
  profileFactIds: readonly string[];
};

const severityRank: Record<RowSeverity, number> = {
  critical: 0,
  gate: 1,
  important: 2,
  minor: 3,
  matched: 4,
};

const severityLabel: Record<RowSeverity, string> = {
  critical: "关键",
  gate: "关键",
  important: "重要",
  minor: "次要",
  matched: "已对上",
};

const tallyLabel: Record<RowSeverity, string> = {
  critical: "关键差异",
  gate: "岗位门槛",
  important: "重要差异",
  minor: "次要差异",
  matched: "已对上",
};

const badgeVariant: Record<RowSeverity, string> = {
  critical: "",
  gate: "badge-index--gate",
  important: "",
  minor: "",
  matched: "badge-index--matched",
};

const severityBandClass: Record<RowSeverity, string> = {
  critical: "bg-[var(--coral)]",
  gate: "bg-[var(--coral)]",
  important: "bg-[var(--cream)]",
  minor: "bg-[var(--mist-blue)]",
  matched: "bg-[var(--mint-strong)]",
};

const severityChipClass: Record<RowSeverity, string> = {
  critical: "severity-critical",
  gate: "severity-critical",
  important: "severity-important",
  minor: "severity-minor",
  matched: "severity-matched",
};

// One list, ordered so the rows that change what you do next come first, and
// the two that are not part of that sequence — a gate rewriting cannot fix,
// and something already covered — sit at the ends carrying a mark instead of
// a number.
function buildRows(result: ResumeJDDifferenceOutput): PanelRow[] {
  const issues = result.issues.map((issue) => {
    const isGate = issue.isGate || issue.type === "gate";
    return {
      id: issue.id,
      severity: (isGate ? "gate" : issue.priority) as RowSeverity,
      badgeMark: "",
      typeLabel: typeCopy[issue.type],
      jdOriginal: issue.jdOriginal,
      jdTranslationZh: issue.jdTranslationZh,
      resumeStatusZh: issue.resumeStatusZh,
      resumeExcerpt: issue.resumeExcerpt,
      unsupported: issue.authenticity === "unsupported",
      problemZh: issue.problemZh,
      reasonZh: issue.reasonZh,
      profileFactIds: issue.profileFactIds,
    } satisfies PanelRow;
  });

  const matched = result.matched.map((item) => ({
    id: item.id,
    severity: "matched" as const,
    badgeMark: "",
    typeLabel: "简历已有可回查证据",
    jdOriginal: item.jdOriginal,
    jdTranslationZh: item.jdTranslationZh,
    resumeStatusZh: "简历里已经有对得上的表述。",
    resumeExcerpt: item.resumeExcerpt,
    unsupported: false,
    problemZh: null,
    reasonZh: item.reasonZh,
    profileFactIds: item.profileFactIds,
  } satisfies PanelRow));

  const ordered = [...issues, ...matched].sort(
    (left, right) => severityRank[left.severity] - severityRank[right.severity],
  );

  let differenceNumber = 0;
  return ordered.map((row) => ({
    ...row,
    badgeMark:
      row.severity === "gate"
        ? "!"
        : row.severity === "matched"
          ? "✓"
          : String((differenceNumber += 1)),
  }));
}

function tally(rows: readonly PanelRow[]) {
  return (Object.keys(severityRank) as RowSeverity[])
    .map((severity) => ({
      severity,
      label: tallyLabel[severity],
      count: rows.filter((row) => row.severity === severity).length,
    }))
    .filter((entry) => entry.count > 0);
}

export function ResumeJDDifferencePanel({
  applicationId,
  run,
  facts,
  control,
  stale = false,
}: ResumeJDDifferencePanelProps) {
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const result = run && run.status === "succeeded" ? run.result : null;

  if (!result || !run) {
    return (
      <section className="sticker-border bg-[var(--cream)] px-6 py-7 shadow-[8px_8px_0_var(--ink)] sm:px-8">
        {control}
      </section>
    );
  }

  const rows = buildRows(result);
  const counts = tally(rows);

  return (
    <section
      className="space-y-7"
      aria-labelledby="resume-jd-difference-title"
      data-run-id={run.id}
    >
      {/* The page's one sticker. It carries the conclusion, not decoration. */}
      <section className="sticker-border bg-[var(--cream)] px-6 py-5 shadow-[6px_6px_0_var(--ink)] sm:px-7">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-[var(--ink-muted)]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--ink)]">
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${stale ? "bg-[var(--coral)]" : "bg-[var(--mint-strong)]"}`}
            />
            {stale ? "结果已过期" : "分析已完成"}
          </span>
          <span aria-hidden="true" className="text-[var(--ink-muted)]">·</span>
          <span lang="und">{run.sourceFilename}</span>
        </p>
        <h2
          id="resume-jd-difference-title"
          className="heading-font mt-2.5 max-w-[34ch] text-xl font-extrabold leading-[1.4] tracking-[-0.02em] sm:text-[23px]"
        >
          {safeCopy(result.overallDifference.summaryZh)}
        </h2>

        {/* Counts as a line of marks, using the same badge language the rows
            below use, so the reader learns it once. */}
        <div
          data-testid="severity-tally"
          className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[color-mix(in_srgb,var(--ink)_20%,transparent)] pt-3.5"
        >
          {counts.map((entry) => (
            <span
              key={entry.severity}
              className="inline-flex items-center gap-2 text-[13px] font-normal text-[var(--ink-muted)]"
            >
              {entry.severity === "gate" || entry.severity === "matched" ? (
                <span
                  aria-hidden="true"
                  className={`grid size-3.5 place-items-center rounded-full text-[9px] font-black leading-none ${
                    entry.severity === "gate" ? "bg-[var(--coral)]" : "bg-[var(--mint)]"
                  }`}
                >
                  {entry.severity === "gate" ? "!" : "✓"}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`severity-dot size-2.5 ${severityBandClass[entry.severity]}`}
                />
              )}
              <span className="font-bold text-[var(--ink)]">{entry.count}</span>
              <span>{entry.label}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-[color-mix(in_srgb,var(--ink)_14%,transparent)] pt-4">
          <a
            className="press inline-flex min-h-10 items-center rounded-full border border-[var(--ink)] px-4 text-[13px] font-semibold hover:bg-[var(--paper)]"
            href={`/api/applications/${applicationId}/resume-jd-difference/export?runId=${run.id}${stale ? "&stale=1" : ""}`}
            download
          >
            导出 Markdown
          </a>
          {control}
        </div>
      </section>

      {/* What the job is actually asking for — a sentence, not three cells. */}
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
        <span className="inline-flex w-fit items-center rounded-full border border-[var(--mint)] bg-[#f2fbf6] px-3 py-1.5 text-xs font-bold text-[#2f6b4f]">
          这个岗位真正要什么
        </span>
        <div className="min-w-0">
          <p className="max-w-[64ch] text-base font-semibold leading-[1.7]">
            {safeCopy(result.jobCore.missionZh)}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {result.jobCore.coreCapabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-full bg-[var(--mint)] px-3 py-1.5 text-[13px] font-semibold text-[#20372c]"
              >
                {capability}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section aria-labelledby="specific-differences-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2
            id="specific-differences-title"
            className="heading-font text-xl font-black tracking-[-0.02em] sm:text-2xl"
          >
            逐条差异 · 按严重度排序
          </h2>
          <span className="text-[13px] font-medium text-[var(--ink-muted)]">
            点任意一行展开依据 · 珊瑚色行是改简历前必须先看的
          </span>
        </div>

        <ol className="soft-surface mt-3.5 list-none p-2">
          {rows.map((row) => (
            <li key={row.id}>
              <IssueDetails
                row={row}
                citedFacts={resolveCitedFacts(row.profileFactIds, factsById)}
              />
            </li>
          ))}
        </ol>
      </section>

      <section className="soft-surface grid gap-5 px-6 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7">
        <div>
          <h2 className="heading-font text-lg font-black">下一步：查看完善建议</h2>
          <p className="mt-1.5 max-w-[62ch] text-sm font-medium leading-[1.7] text-[var(--ink-muted)]">
            建议只告诉你该核对哪段经历、补足哪些真实信息，不会代写简历。
          </p>
        </div>
        <Link
          href={`/applications/${applicationId}?tab=improvements`}
          className="button-primary inline-flex min-h-12 shrink-0 items-center justify-center rounded-full px-6 text-[15px] font-extrabold"
        >
          查看完善建议 →
        </Link>
      </section>
    </section>
  );
}
