import Link from "next/link";

import type { ResumeJDDifferenceRun } from "./repository";
import type { DifferenceIssue, ResumeJDDifferenceOutput } from "./schemas";

export type ResumeJDDifferencePanelProps = {
  applicationId: string;
  run: ResumeJDDifferenceRun | null;
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

const priorityClass: Record<DifferenceIssue["priority"], string> = {
  critical: "bg-[var(--coral)]",
  important: "bg-[var(--cream)]",
  minor: "bg-[var(--mist-blue)]",
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

function IssueDetails({
  issue,
  kind,
}: {
  issue: DifferenceIssue;
  kind: "difference" | "gate";
}) {
  return (
    <details
      className="group border-t border-[var(--line)] first:border-t-0"
      data-testid={`${kind}-issue-${issue.id}`}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 marker:hidden focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--mist-blue)] sm:px-5">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-[var(--ink)] bg-white text-xs font-black transition-transform group-open:rotate-45"
        >
          +
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black leading-6">
            {safeCopy(issue.jdTranslationZh)}
          </span>
          <span className="mt-1 block break-words text-xs font-semibold leading-5 text-[var(--ink-muted)]" lang="und">
            {issue.jdOriginal}
          </span>
        </span>
        <span className={`status-chip ${priorityClass[issue.priority]}`}>
          {priorityCopy[issue.priority]} · {typeCopy[issue.type]}
        </span>
      </summary>
      <div className="border-t border-[var(--line)] bg-[var(--paper)] px-4 py-5 sm:px-11">
        <dl className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
          <div>
            <dt className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              JD 原文
            </dt>
            <dd className="mt-2 break-words text-sm font-semibold leading-6" lang="und">
              {issue.jdOriginal}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              中文解释
            </dt>
            <dd className="mt-2 text-sm font-semibold leading-6">
              {safeCopy(issue.jdTranslationZh)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              简历现状
            </dt>
            <dd className="mt-2 text-sm font-semibold leading-6">
              <span className="block">{safeCopy(issue.resumeStatusZh)}</span>
              <span className="mt-2 block rounded-xl border border-[var(--line)] bg-white px-3 py-2" lang="und">
                {resumeEvidence(issue)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              问题点
            </dt>
            <dd className="mt-2 text-sm font-semibold leading-6">
              {safeCopy(issue.problemZh)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              判断依据
            </dt>
            <dd className="mt-2 text-sm font-semibold leading-6">
              {safeCopy(issue.reasonZh)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              优先级
            </dt>
            <dd className="mt-2 text-sm font-black">
              {priorityCopy[issue.priority]}
            </dd>
          </div>
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
  stale = false,
}: ResumeJDDifferencePanelProps) {
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
    <section className="space-y-8" aria-labelledby="resume-jd-difference-title">
      <div className="dense-surface grid overflow-hidden sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="bg-[var(--cream)] px-5 py-4 text-xs font-black uppercase tracking-[0.14em]">
          本次对照简历
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
        <div className="dense-surface overflow-hidden">
          {differences.map((issue) => (
            <IssueDetails key={issue.id} issue={issue} kind="difference" />
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
          <div className="dense-surface overflow-hidden border-l-4 border-l-[var(--coral)]">
            {gates.map((issue) => (
              <IssueDetails key={issue.id} issue={issue} kind="gate" />
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
