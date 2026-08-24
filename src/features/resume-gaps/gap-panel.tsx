"use client";

import { useState } from "react";

import {
  classifyGap,
  classifyProfileOnlyRequirement,
  explainGap,
  type ProfileOnlyGroup,
  type ResumeGapCurrentRequirement,
  type ResumeGapItemView,
  type ResumeGapRun,
} from "./schemas";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import type { ResumeAssetOption } from "./baseline-selector";

type GapProfileRequirement = ResumeGapCurrentRequirement & { evidence: ConfirmedFactForAnalysis[] };

type GapRunSummary = {
  id: string;
  status: ResumeGapRun["status"];
  errorCode?: string | null;
  sourceFilename: string;
  sourceAssetId: string | null;
  analysisRunId: string;
};

export type GapPanelProps = {
  applicationId: string;
  baseline: ResumeAssetOption | null;
  requirements: GapProfileRequirement[];
  run: GapRunSummary | null;
  fallbackRun: GapRunSummary | null;
  currentAnalysisRunId?: string | null;
  items: Array<ResumeGapItemView & { historical?: boolean }>;
};

const gapLabels = {
  resume_omission: "简历漏写",
  partial_coverage: "部分覆盖",
  missing_evidence: "缺少证据",
  covered: "已经覆盖",
} as const;

const profileLabels: Record<ProfileOnlyGroup, string> = {
  profile_supported: "档案已支持",
  partial_match: "部分匹配",
  missing_evidence: "缺少证据",
  needs_user: "需要判断",
};

const priorityLabel = (priority: "core" | "supporting") => priority === "core" ? "核心" : "补充";
const factLabel = (fact: { title: string; description?: string | null; sourceExcerpt?: string | null }) =>
  [fact.title, fact.description, fact.sourceExcerpt ?? "来源可见"].filter(Boolean).join(" · ");

function StatusSymbol({ label }: { label: string }) {
  const symbol = label === "已经覆盖" || label === "档案已支持" ? "✓" : label === "缺少证据" || label === "简历漏写" ? "!" : "~";
  return <span className="status-chip bg-white">{`${symbol} ${label}`}</span>;
}

function ProfileOnlyRow({ requirement }: { requirement: GapPanelProps["requirements"][number] }) {
  const [open, setOpen] = useState(false);
  const group = classifyProfileOnlyRequirement(requirement);
  return (
    <div className="border-t border-[var(--line)] first:border-t-0">
      <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="min-w-0 text-sm font-black">{requirement.text}</span>
        <span className="flex shrink-0 items-center gap-2"><span className="text-xs font-bold text-[var(--ink-muted)]">{priorityLabel(requirement.priority)}</span><StatusSymbol label={profileLabels[group]} /></span>
      </button>
      {open ? (
        <div className="space-y-3 pb-4 text-sm">
          {requirement.evidence.length ? (
            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">已确认职业事实及来源</p>
              {requirement.evidence.map((fact) => <p key={fact.id} className="mt-1 font-semibold">{factLabel(fact)}</p>)}
            </div>
          ) : <p className="font-semibold text-[var(--ink-muted)]">暂无已确认职业事实。</p>}
          {requirement.sourceExcerpt ? <div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">JD 摘录</p><p className="mt-1 font-semibold">{requirement.sourceExcerpt}</p></div> : null}
        </div>
      ) : null}
    </div>
  );
}

function GapRow({ item }: { item: GapPanelProps["items"][number] }) {
  const [open, setOpen] = useState(false);
  const group = classifyGap(item);
  return (
    <div className="border-t border-[var(--line)] first:border-t-0">
      <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="min-w-0 text-sm font-black">{item.requirementText}</span>
        <span className="flex shrink-0 items-center gap-2"><span className="text-xs font-bold text-[var(--ink-muted)]">{priorityLabel(item.priority)}</span><StatusSymbol label={gapLabels[group]} /></span>
      </button>
      {open ? (
        <div className="space-y-4 pb-4 text-sm">
          <div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">JD 摘录</p><p className="mt-1 font-semibold">{item.jdSourceExcerpt}</p></div>
          {item.verifiedResumeExcerpt ? <div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">已验证的简历摘录</p><p className="mt-1 font-semibold">{item.verifiedResumeExcerpt}</p></div> : null}
          {item.profileEvidence.length ? <div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">已确认职业事实及来源</p>{item.profileEvidence.map((fact) => <p key={fact.id} className="mt-1 font-semibold">{factLabel(fact)}</p>)}</div> : null}
          <div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">确定性说明</p><p className="mt-1 font-semibold">{explainGap(item)}</p></div>
        </div>
      ) : null}
    </div>
  );
}

export function GapPanel({ baseline, requirements, run, fallbackRun, items, currentAnalysisRunId = null }: GapPanelProps) {
  if (!baseline) {
    const profileCounts = requirements.reduce<Record<ProfileOnlyGroup, number>>((counts, requirement) => {
      counts[classifyProfileOnlyRequirement(requirement)] += 1;
      return counts;
    }, { profile_supported: 0, partial_match: 0, missing_evidence: 0, needs_user: 0 });
    return (
      <section className="dense-surface min-w-0 p-5 sm:p-6" aria-labelledby="profile-only-title">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">Resume view</p><h2 id="profile-only-title" className="heading-font mt-1 text-2xl font-black">仅职业档案模式</h2></div><span className="status-chip bg-[var(--cream)]">不比较简历</span></div>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ink-muted)]">选择一份对照简历后，才会显示简历覆盖情况。这里仅显示已确认职业档案与 JD 的匹配状态。</p>
        <div className="mt-5 grid grid-cols-2 border-y border-[var(--line)] sm:grid-cols-4" aria-label="职业档案摘要">
          {(Object.keys(profileLabels) as ProfileOnlyGroup[]).map((group) => <div key={group} className="border-r border-[var(--line)] px-3 py-3 last:border-r-0"><p className="text-xs font-bold text-[var(--ink-muted)]">{profileLabels[group]}</p><p className="mt-1 text-xl font-black">{profileCounts[group]}</p></div>)}
        </div>
        <div className="mt-5 border-t border-[var(--line)]">{requirements.length ? requirements.map((requirement) => <ProfileOnlyRow key={requirement.id} requirement={requirement} />) : <p className="py-5 text-sm font-semibold text-[var(--ink-muted)]">完成 JD 分析后，这里会显示职业档案匹配结果。</p>}</div>
      </section>
    );
  }

  const displayRun = run?.status === "succeeded" ? run : fallbackRun?.status === "succeeded" ? fallbackRun : null;
  const historicalItems = items.some((item) => item.historical === true);
  const stale = (run !== null && run.status !== "succeeded" && fallbackRun?.status === "succeeded") || historicalItems || Boolean(
    displayRun && baseline && (
      displayRun.sourceAssetId !== baseline.id ||
      (currentAnalysisRunId !== null && displayRun.analysisRunId !== currentAnalysisRunId)
    ),
  );
  const grouped = {
    resume_omission: items.filter((item) => classifyGap(item) === "resume_omission"),
    partial_coverage: items.filter((item) => classifyGap(item) === "partial_coverage"),
    missing_evidence: items.filter((item) => classifyGap(item) === "missing_evidence"),
    covered: items.filter((item) => classifyGap(item) === "covered"),
  };
  const actionGroups = (["resume_omission", "partial_coverage", "missing_evidence"] as const).filter((group) => grouped[group].length > 0);
  return (
    <section className="dense-surface min-w-0 p-5 sm:p-6" aria-labelledby="gap-panel-title">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">Resume view</p><h2 id="gap-panel-title" className="heading-font mt-1 text-2xl font-black">简历差距结果</h2></div><span className="status-chip bg-[var(--mint)]">{displayRun ? `${items.length} 项` : "等待分析"}</span></div>
      {stale ? <p role="alert" className="mt-4 border border-[var(--coral)] bg-[var(--cream)] p-3 text-sm font-bold">这是上一份简历或上一版 JD 的结果，仅供只读参考。快照文件：{fallbackRun?.sourceFilename ?? displayRun?.sourceFilename ?? "未命名文件"}。<span className="ml-2">只读旧快照</span></p> : null}
      {run?.status === "failed" && !fallbackRun ? <p role="alert" className="mt-4 text-sm font-bold text-[var(--error)]">上一次分析失败，请重试。</p> : null}
      {displayRun ? <div className="mt-5 space-y-5">
        <div className="grid grid-cols-2 border-y border-[var(--line)] sm:grid-cols-4" aria-label="简历差距摘要">
          {(["resume_omission", "partial_coverage", "missing_evidence", "covered"] as const).map((group) => <div key={group} className="border-r border-[var(--line)] px-3 py-3 last:border-r-0"><p className="text-xs font-bold text-[var(--ink-muted)]">{gapLabels[group]}</p><p className="mt-1 text-xl font-black">{grouped[group].length}</p></div>)}
        </div>
        {!actionGroups.length ? <p className="border-b border-[var(--line)] pb-4 text-sm font-semibold">这份简历已覆盖当前 JD 要求。已覆盖项目仍可在下方展开查看。</p> : null}
        {actionGroups.map((group) => <section key={group} aria-labelledby={`gap-group-${group}`}><div className="flex items-center justify-between border-b border-[var(--line)] pb-2"><h3 id={`gap-group-${group}`} className="text-sm font-black">{gapLabels[group]}</h3><span className="text-xs font-bold text-[var(--ink-muted)]">{grouped[group].length}</span></div><div>{grouped[group].map((item) => <GapRow key={item.id} item={item} />)}</div></section>)}
        <details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer list-none text-sm font-black"><span className="inline-flex items-center gap-2"><span aria-hidden="true">›</span>{gapLabels.covered}<span className="text-xs font-bold text-[var(--ink-muted)]">{grouped.covered.length}</span></span></summary><div className="mt-3"><div>{grouped.covered.map((item) => <GapRow key={item.id} item={item} />)}</div></div></details>
      </div> : null}
    </section>
  );
}
