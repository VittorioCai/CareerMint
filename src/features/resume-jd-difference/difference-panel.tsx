import Link from "next/link";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import type { ResumeJDDifferenceRun } from "./repository";
import type { DifferenceIssue, ResumeJDDifferenceOutput } from "./schemas";

export type ResumeJDDifferencePanelProps = {
  applicationId: string;
  run: ResumeJDDifferenceRun | null;
  facts: ConfirmedFactForAnalysis[];
  stale?: boolean;
};

const priorityCopy: Record<DifferenceIssue["priority"], string> = {
  critical: "关键",
  important: "重要",
  minor: "次要",
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

const severityBandClass: Record<DifferenceIssue["priority"], string> = {
  critical: "bg-[var(--coral)]",
  important: "bg-[var(--cream)]",
  minor: "bg-[var(--mist-blue)]",
};

const severityChipClass: Record<DifferenceIssue["priority"], string> = {
  critical: "severity-critical",
  important: "severity-important",
  minor: "severity-minor",
};

function safeCopy(value: string) {
  return value
    .replaceAll("你不具备", "当前材料未找到相关证据")
    .replaceAll("用户不具备", "当前材料未找到相关证据");
}

function resumeEvidence(issue: DifferenceIssue) {
  if (!issue.resumeExcerpt || issue.authenticity === "unsupported") {
    return "当前材料未找到相关证据";
  }
  return issue.resumeExcerpt;
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
  issue,
  kind,
  citedFacts,
  badgeMark,
}: {
  issue: DifferenceIssue;
  kind: "difference" | "gate";
  citedFacts: ConfirmedFactForAnalysis[];
  badgeMark: string;
}) {
  const isGate = issue.isGate || issue.type === "gate";
  return (
    <details className="group" data-testid={`${kind}-issue-${issue.id}`}>
      <span
        aria-hidden="true"
        className={`severity-band mx-4 mb-1 mt-2.5 block ${severityBandClass[issue.priority]}`}
      />
      <summary className="flex cursor-pointer list-none items-start gap-4 rounded-2xl px-4 py-3.5 marker:hidden focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--mist-blue)]">
        <span
          aria-hidden="true"
          data-testid="row-badge"
          className={`badge-index heading-font mt-0.5 ${isGate ? "badge-index--gate" : ""}`}
        >
          {badgeMark}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span
              data-testid="row-priority"
              className={`severity-chip ${severityChipClass[issue.priority]}`}
            >
              {priorityCopy[issue.priority]}
            </span>
            <span
              data-testid="row-type"
              className="text-xs font-semibold text-[var(--ink-muted)]"
            >
              {typeCopy[issue.type]}
            </span>
          </span>
          <span className="mt-2 block text-base font-bold leading-[1.55]">
            {safeCopy(issue.jdTranslationZh)}
          </span>
          <span
            className="mt-1.5 block break-words text-[13px] font-normal italic leading-[1.6] text-[var(--ink-muted)]"
            lang="und"
          >
            “{issue.jdOriginal}”
          </span>
        </span>
        <span
          aria-hidden="true"
          className="mt-1 grid size-7 shrink-0 place-items-center rounded-full transition-transform group-open:rotate-180"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink-muted)]">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </span>
      </summary>
      <div className="ml-[58px] mr-4 mb-3 rounded-2xl bg-[var(--canvas)] px-5 py-4">
        <dl className="grid gap-x-8 gap-y-5 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              简历现状
            </dt>
            <dd className="mt-2 text-sm font-medium leading-[1.65]">
              <span className="block">{safeCopy(issue.resumeStatusZh)}</span>
              <span className="mt-2 block rounded-xl bg-white px-3 py-2 font-normal text-[var(--ink-muted)]" lang="und">
                {resumeEvidence(issue)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              问题点
            </dt>
            <dd className="mt-2 text-sm font-medium leading-[1.65]">
              {safeCopy(issue.problemZh)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              判断依据
            </dt>
            <dd className="mt-2 text-sm font-medium leading-[1.65]">
              {safeCopy(issue.reasonZh)}
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

function topIssues(result: ResumeJDDifferenceOutput) {
  const byId = new Map(result.issues.map((issue) => [issue.id, issue]));
  return result.overallDifference.topIssueIds
    .map((id) => byId.get(id))
    .filter((issue): issue is DifferenceIssue => Boolean(issue && !issue.isGate))
    .slice(0, 3);
}

export function ResumeJDDifferencePanel({
  applicationId,
  run,
  facts,
  stale = false,
}: ResumeJDDifferencePanelProps) {
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  if (!run || run.status !== "succeeded" || !run.result) {
    return (
      <section className="dense-surface px-5 py-8 text-sm font-semibold text-[var(--ink-muted)]">
        尚未完成差异分析。选好对照简历后，点击“开始差异分析”。
      </section>
    );
  }

  const result = run.result;
  const differences = result.issues.filter((issue) => !issue.isGate);
  const gates = result.issues.filter((issue) => issue.isGate);
  const leadingIssues = topIssues(result);

  return (
    <section
      className="space-y-8"
      aria-labelledby="resume-jd-difference-title"
      data-run-id={run.id}
    >
      <div className="dense-surface grid overflow-hidden sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="bg-[var(--cream)] px-5 py-4 text-xs font-black uppercase tracking-[0.14em]">
          {stale ? "上一次分析使用的简历" : "本次对照简历"}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <h2 id="resume-jd-difference-title" className="break-words text-base font-black">
              {run.sourceFilename}
            </h2>
            <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">
              所有判断只针对这份简历；职业档案只作为已确认补充，不计作简历已覆盖。
            </p>
          </div>
          <a
            className="button-secondary inline-flex min-h-10 shrink-0 items-center px-4 text-xs font-black"
            href={`/api/applications/${applicationId}/resume-jd-difference/export?runId=${run.id}${stale ? "&stale=1" : ""}`}
            download
          >
            导出 Markdown
          </a>
        </div>
      </div>

      <section className="sticker-border overflow-hidden bg-[var(--mint)] shadow-[6px_6px_0_var(--ink)]" aria-labelledby="job-core-title">
        <div className="border-b-2 border-[var(--ink)] px-5 py-5 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Job brief
          </p>
          <h2 id="job-core-title" className="heading-font mt-1 text-2xl font-black sm:text-3xl">
            岗位核心判断
          </h2>
          <p className="mt-3 max-w-4xl text-base font-bold leading-7">
            {safeCopy(result.jobCore.missionZh)}
          </p>
        </div>
        <ol className="grid gap-px bg-[var(--ink)] sm:grid-cols-3">
          {result.jobCore.coreCapabilities.map((capability, index) => (
            <li key={`${index}-${capability}`} className="bg-[var(--mint)] px-5 py-4">
              <span className="text-xs font-black text-[var(--ink-muted)]">
                0{index + 1}
              </span>
              <span className="mt-1 block text-sm font-black leading-6">
                {safeCopy(capability)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="dense-surface overflow-hidden" aria-labelledby="overall-difference-title">
        <div className="bg-[var(--mist-blue)] px-5 py-5 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Executive read
          </p>
          <h2 id="overall-difference-title" className="heading-font mt-1 text-2xl font-black">
            这份简历的总体差异
          </h2>
          <p className="mt-3 max-w-4xl text-sm font-bold leading-7">
            {safeCopy(result.overallDifference.summaryZh)}
          </p>
        </div>
        {leadingIssues.length ? (
          <ol className="grid border-t border-[var(--line)] lg:grid-cols-3">
            {leadingIssues.map((issue, index) => (
              <li
                key={issue.id}
                data-testid="top-difference"
                className="border-t border-[var(--line)] px-5 py-4 first:border-t-0 lg:border-l lg:border-t-0 lg:first:border-l-0"
              >
                <p className="text-xs font-black text-[var(--ink-muted)]">
                  重点 0{index + 1}
                </p>
                <p className="mt-2 text-sm font-black leading-6">
                  {safeCopy(issue.problemZh)}
                </p>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section aria-labelledby="specific-differences-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Evidence review
            </p>
            <h2 id="specific-differences-title" className="heading-font mt-1 text-2xl font-black">
              具体差异
            </h2>
          </div>
          <span className="text-xs font-black text-[var(--ink-muted)]">
            {differences.length} 项 · 点击逐条查看依据
          </span>
        </div>
        <div className="soft-surface overflow-hidden p-1.5">
          {differences.map((issue, index) => (
            <IssueDetails
              key={issue.id}
              issue={issue}
              kind="difference"
              badgeMark={String(index + 1)}
              citedFacts={resolveCitedFacts(issue.profileFactIds, factsById)}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="gate-differences-title">
        <div className="mb-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Qualification check
          </p>
          <h2 id="gate-differences-title" className="heading-font mt-1 text-2xl font-black">
            岗位门槛待确认
          </h2>
        </div>
        {gates.length ? (
          <div className="soft-surface overflow-hidden p-1.5">
            {gates.map((issue) => (
              <IssueDetails
                key={issue.id}
                issue={issue}
                kind="gate"
                badgeMark="!"
                citedFacts={resolveCitedFacts(issue.profileFactIds, factsById)}
              />
            ))}
          </div>
        ) : (
          <p className="dense-surface px-5 py-4 text-sm font-semibold text-[var(--ink-muted)]">
            当前分析没有识别出需要单独确认的硬性门槛。
          </p>
        )}
      </section>

      <section aria-labelledby="matched-title">
        <div className="mb-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Confirmed alignment
          </p>
          <h2 id="matched-title" className="heading-font mt-1 text-2xl font-black">
            已经对上的内容
          </h2>
        </div>
        <details className="dense-surface overflow-hidden" data-testid="matched-details">
          <summary className="cursor-pointer px-5 py-4 text-sm font-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--mist-blue)]">
            查看 {result.matched.length} 条已匹配内容
          </summary>
          <ul className="border-t border-[var(--line)]">
            {result.matched.map((item) => (
              <li key={item.id} className="border-t border-[var(--line)] px-5 py-5 first:border-t-0">
                <p className="text-sm font-black leading-6">{safeCopy(item.jdTranslationZh)}</p>
                <p className="mt-1 break-words text-xs font-semibold leading-5 text-[var(--ink-muted)]" lang="und">
                  {item.jdOriginal}
                </p>
                <blockquote className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm font-semibold leading-6" lang="und">
                  {item.resumeExcerpt}
                </blockquote>
                <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
                  {safeCopy(item.reasonZh)}
                </p>
                {resolveCitedFacts(item.profileFactIds, factsById).length ? (
                  <p className="mt-1 text-xs font-bold leading-5 text-[var(--ink-muted)]">
                    档案依据：
                    {resolveCitedFacts(item.profileFactIds, factsById)
                      .map((fact) => fact.title)
                      .join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="sticker-border grid gap-4 bg-[var(--cream)] p-5 shadow-[5px_5px_0_var(--ink)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6" aria-labelledby="difference-next-step-title">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Soft workflow
          </p>
          <h2 id="difference-next-step-title" className="heading-font mt-1 text-xl font-black">
            下一步：查看完善建议
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ink-muted)]">
            建议会告诉你应核对哪段经历、补足哪些真实信息，不会直接代写或修改简历。
          </p>
        </div>
        <Link
          href={`/applications/${applicationId}?tab=improvements`}
          className="button-secondary inline-flex min-h-11 items-center justify-center px-5 text-sm font-black"
        >
          查看完善建议
        </Link>
      </section>
    </section>
  );
}
