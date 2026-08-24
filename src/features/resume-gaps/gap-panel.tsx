"use client";

import Link from "next/link";
import { useState } from "react";

import type { RequirementMatchStatus } from "@/features/jd-analysis/schemas";
import { compareRequirements } from "@/features/jd-analysis/requirement-order";

import {
  classifyGap,
  classifyProfileOnlyRequirement,
  explainGap,
  type ProfileOnlyGroup,
  type ResumeCoverage,
} from "./schemas";
import type { ResumeAssetOption } from "./baseline-selector";

type GapFact = {
  id: string;
  title: string;
  description: string;
  sourceExcerpt: string | null;
};

type GapProfileRequirement = {
  id: string;
  text: string;
  translationZh?: string | null;
  priority: "core" | "supporting";
  sortOrder?: number;
  matchStatus: RequirementMatchStatus;
  evidence: GapFact[];
  sourceExcerpt?: string | null;
};

type GapItem = {
  id: string;
  requirementText: string;
  translationZh?: string | null;
  priority: "core" | "supporting";
  sortOrder?: number;
  jdSourceExcerpt: string;
  resumeCoverage: ResumeCoverage;
  verifiedResumeExcerpt: string | null;
  profileEvidence: GapFact[];
  matchStatus?: RequirementMatchStatus;
  historical?: boolean;
};

type GapRunStatus = "queued" | "running" | "succeeded" | "failed";
type GapRunSummary = {
  status: GapRunStatus;
  sourceFilename: string;
  sourceAssetId: string | null;
  analysisRunId: string;
};

export type GapPanelProps = {
  applicationId?: string;
  baseline: Pick<ResumeAssetOption, "id" | "originalName" | "contentType" | "createdAt"> | null;
  requirements: GapProfileRequirement[];
  run: GapRunSummary | null;
  fallbackRun: GapRunSummary | null;
  currentAnalysisRunId?: string | null;
  items: GapItem[];
};

function MarkdownExportControl({ applicationId }: { applicationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/resume/gaps/export`,
      );
      if (!response.ok) throw new Error("resume-gap-export-failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = encodedName
        ? decodeURIComponent(encodedName)
        : "resume-gap.md";
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setMessage("Markdown 已下载。文件只包含当前未解决差距。");
    } catch {
      setFailed(true);
      setMessage("暂时无法导出，请确认当前简历差距已完成后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="button-secondary min-h-10 px-4 text-sm font-black disabled:cursor-wait disabled:opacity-60"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "正在导出…" : "导出 Markdown"}
      </button>
      {message ? (
        <p
          role={failed ? "alert" : "status"}
          className={`mt-2 text-xs font-bold ${failed ? "text-[var(--error)]" : "text-[var(--ink-muted)]"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

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
const normalizeFactText = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase();

function orderGapRows<T extends {
  matchStatus?: RequirementMatchStatus;
  priority: "core" | "supporting";
  sortOrder?: number;
}>(rows: readonly T[]) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (left, right) =>
        compareRequirements(
          {
            matchStatus: left.row.matchStatus ?? "none",
            priority: left.row.priority,
            sortOrder: left.row.sortOrder ?? left.index,
          },
          {
            matchStatus: right.row.matchStatus ?? "none",
            priority: right.row.priority,
            sortOrder: right.row.sortOrder ?? right.index,
          },
        ) || left.index - right.index,
    )
    .map(({ row }) => row);
}

export function summaryCellClass(index: number) {
  return [
    "px-3 py-3",
    index % 2 === 1 ? "border-l border-[var(--line)]" : "",
    index >= 2 ? "border-t border-[var(--line)] sm:border-t-0" : "",
    index > 0 ? "sm:border-l sm:border-[var(--line)]" : "",
  ].filter(Boolean).join(" ");
}

function StatusSymbol({ label }: { label: string }) {
  const symbol = label === "已经覆盖" || label === "档案已支持" ? "✓" : label === "缺少证据" || label === "简历漏写" ? "!" : "~";
  return <span className="status-chip bg-white">{`${symbol} ${label}`}</span>;
}

function FactEvidence({ facts }: { facts: GapFact[] }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">已确认职业事实及来源</p>
        <Link href="/profile" className="text-xs font-black underline underline-offset-4">查看职业档案</Link>
      </div>
      {facts.map((fact) => {
        const sourceExcerpt = fact.sourceExcerpt?.trim() || null;
        const hasDistinctSource = sourceExcerpt !== null && normalizeFactText(sourceExcerpt) !== normalizeFactText(fact.description);
        return (
          <div key={fact.id} className="mt-3 space-y-1">
            <p className="break-words whitespace-pre-wrap font-black">{fact.title}</p>
            <p className="break-words whitespace-pre-wrap font-semibold">{fact.description}</p>
            {hasDistinctSource ? <p className="break-words whitespace-pre-wrap font-semibold"><span className="font-black text-[var(--ink-muted)]">原始来源：</span>{sourceExcerpt}</p> : null}
            {sourceExcerpt === null ? <p className="break-words whitespace-pre-wrap font-semibold text-[var(--ink-muted)]">来源：用户手动确认</p> : null}
          </div>
        );
      })}
      {!facts.length ? <p className="mt-1 break-words whitespace-pre-wrap font-semibold text-[var(--ink-muted)]">暂无已确认职业事实。</p> : null}
    </div>
  );
}

function ProfileOnlyRow({ requirement }: { requirement: GapProfileRequirement }) {
  const [open, setOpen] = useState(false);
  const group = classifyProfileOnlyRequirement(requirement);
  return (
    <div className="border-t border-[var(--line)] first:border-t-0">
      <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="min-w-0">
          <span className="block break-words whitespace-pre-wrap text-sm font-black">{requirement.text}</span>
          {requirement.translationZh ? <span className="mt-1 block break-words whitespace-pre-wrap text-xs font-semibold text-[var(--ink-muted)]">{requirement.translationZh}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2"><span className="text-xs font-bold text-[var(--ink-muted)]">{priorityLabel(requirement.priority)}</span><StatusSymbol label={profileLabels[group]} /></span>
      </button>
      {open ? (
        <div className="space-y-3 pb-4 text-sm">
          {!requirement.translationZh ? <p className="font-semibold text-[var(--ink-muted)]">这份历史分析没有保存中文翻译。</p> : null}
          {requirement.evidence.length ? <FactEvidence facts={requirement.evidence} /> : <p className="font-semibold text-[var(--ink-muted)]">暂无已确认职业事实。</p>}
          {requirement.sourceExcerpt ? <div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">JD 摘录</p><p className="mt-1 break-words whitespace-pre-wrap font-semibold">{requirement.sourceExcerpt}</p></div> : null}
        </div>
      ) : null}
    </div>
  );
}

function GapRow({ item }: { item: GapItem }) {
  const [open, setOpen] = useState(false);
  const group = classifyGap(item);
  return (
    <div className="border-t border-[var(--line)] first:border-t-0">
      <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="min-w-0">
          <span className="block break-words whitespace-pre-wrap text-sm font-black">{item.requirementText}</span>
          {item.translationZh ? <span className="mt-1 block break-words whitespace-pre-wrap text-xs font-semibold text-[var(--ink-muted)]">{item.translationZh}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2"><span className="text-xs font-bold text-[var(--ink-muted)]">{priorityLabel(item.priority)}</span><StatusSymbol label={gapLabels[group]} />{item.matchStatus === "needs_user" ? <span className="text-xs font-bold text-[var(--ink-muted)]">需要用户判断</span> : null}</span>
      </button>
      {open ? (
        <div className="space-y-4 pb-4 text-sm">
          {!item.translationZh ? <p className="font-semibold text-[var(--ink-muted)]">这份历史分析没有保存中文翻译。</p> : null}
          <div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">JD 摘录</p><p className="mt-1 break-words whitespace-pre-wrap font-semibold">{item.jdSourceExcerpt}</p></div>
          {item.verifiedResumeExcerpt ? <div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">已验证的简历摘录</p><p className="mt-1 break-words whitespace-pre-wrap font-semibold">{item.verifiedResumeExcerpt}</p></div> : null}
          <FactEvidence facts={item.profileEvidence} />
          <div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">确定性说明</p><p className="mt-1 break-words whitespace-pre-wrap font-semibold">{explainGap(item)}</p></div>
        </div>
      ) : null}
    </div>
  );
}

function HistoricalRow({ item }: { item: GapItem }) {
  const [open, setOpen] = useState(false);
  const coverage = item.resumeCoverage === "covered" ? "已覆盖（旧快照）" : item.resumeCoverage === "partial" ? "部分覆盖（旧快照）" : "未覆盖（旧快照）";
  return (
    <div className="border-t border-[var(--line)] first:border-t-0">
      <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="min-w-0"><span className="block break-words whitespace-pre-wrap text-sm font-black">{item.requirementText}</span>{item.translationZh ? <span className="mt-1 block break-words whitespace-pre-wrap text-xs font-semibold text-[var(--ink-muted)]">{item.translationZh}</span> : null}</span><span className="status-chip bg-white">{coverage}</span>
      </button>
      {open ? <div className="space-y-3 pb-4 text-sm">{!item.translationZh ? <p className="break-words whitespace-pre-wrap font-semibold text-[var(--ink-muted)]">旧快照未保存中文翻译。</p> : null}<div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">JD 摘录</p><p className="mt-1 break-words whitespace-pre-wrap font-semibold">{item.jdSourceExcerpt}</p></div>{item.verifiedResumeExcerpt ? <div><p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">已验证的简历摘录</p><p className="mt-1 break-words whitespace-pre-wrap font-semibold">{item.verifiedResumeExcerpt}</p></div> : null}<p className="break-words whitespace-pre-wrap font-semibold text-[var(--ink-muted)]">原职业档案证据无法从历史快照重建。</p></div> : null}
    </div>
  );
}

export function GapPanel({ applicationId, baseline, requirements, run, fallbackRun, items, currentAnalysisRunId = null }: GapPanelProps) {
  if (!baseline) {
    const profileCounts = requirements.reduce<Record<ProfileOnlyGroup, number>>((counts, requirement) => {
      counts[classifyProfileOnlyRequirement(requirement)] += 1;
      return counts;
    }, { profile_supported: 0, partial_match: 0, missing_evidence: 0, needs_user: 0 });
    return (
      <section className="dense-surface min-w-0 p-5 sm:p-6" aria-labelledby="profile-only-title">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">Resume view</p><h2 id="profile-only-title" className="heading-font mt-1 text-2xl font-black">仅职业档案模式</h2></div><span className="status-chip bg-[var(--cream)]">不比较简历</span></div>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ink-muted)]">选择一份对照简历后，才会显示简历覆盖情况。这里仅显示已确认职业档案与 JD 的匹配状态。</p>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4" aria-label="职业档案摘要">{(Object.keys(profileLabels) as ProfileOnlyGroup[]).map((group, index) => <div key={group} className={summaryCellClass(index)}><p className="text-xs font-bold text-[var(--ink-muted)]">{profileLabels[group]}</p><p className="mt-1 text-xl font-black">{profileCounts[group]}</p></div>)}</div>
        <div className="mt-5 border-t border-[var(--line)]">{requirements.length ? orderGapRows(requirements).map((requirement) => <ProfileOnlyRow key={requirement.id} requirement={requirement} />) : <p className="py-5 text-sm font-semibold text-[var(--ink-muted)]">完成 JD 分析后，这里会显示职业档案匹配结果。</p>}</div>
      </section>
    );
  }

  const currentItems = items.filter((item) => !item.historical);
  const historicalItems = items.filter((item) => item.historical);
  const displayRun = run?.status === "succeeded" ? run : fallbackRun?.status === "succeeded" ? fallbackRun : null;
  const currentRunMatches = Boolean(run && run.sourceAssetId === baseline.id && currentAnalysisRunId !== null && run.analysisRunId === currentAnalysisRunId);
  const historicalOnly = historicalItems.length > 0 && currentItems.length === 0;
  const showCurrentAnalysis = Boolean(displayRun && !historicalOnly);
  const stale = (run !== null && run.status !== "succeeded" && fallbackRun?.status === "succeeded") || historicalItems.length > 0 || Boolean(displayRun && (displayRun.sourceAssetId !== baseline.id || (currentAnalysisRunId !== null && displayRun.analysisRunId !== currentAnalysisRunId)));
  const grouped = {
    resume_omission: orderGapRows(currentItems.filter((item) => classifyGap(item) === "resume_omission")),
    partial_coverage: orderGapRows(currentItems.filter((item) => classifyGap(item) === "partial_coverage")),
    missing_evidence: orderGapRows(currentItems.filter((item) => classifyGap(item) === "missing_evidence")),
    covered: orderGapRows(currentItems.filter((item) => classifyGap(item) === "covered")),
  };
  const actionGroups = (["resume_omission", "partial_coverage", "missing_evidence"] as const).filter((group) => grouped[group].length > 0);
  return (
    <section className="dense-surface min-w-0 p-5 sm:p-6" aria-labelledby="gap-panel-title">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">Resume view</p><h2 id="gap-panel-title" className="heading-font mt-1 text-2xl font-black">简历差距结果</h2></div><span className="status-chip bg-[var(--mint)]">{historicalOnly ? `历史快照 ${historicalItems.length} 项` : displayRun ? `${currentItems.length} 项` : "等待分析"}</span></div>
      {stale ? <p role="alert" className="mt-4 border border-[var(--coral)] bg-[var(--cream)] p-3 text-sm font-bold">这是上一份简历或上一版 JD 的结果，仅供只读参考。快照文件：{fallbackRun?.sourceFilename ?? displayRun?.sourceFilename ?? "未命名文件"}。<span className="ml-2">只读旧快照</span></p> : null}
      {run?.status === "failed" && !fallbackRun && currentRunMatches ? <p role="alert" className="mt-4 text-sm font-bold text-[var(--error)]">上一次分析失败，请重试。</p> : null}
      {showCurrentAnalysis ? <div className="mt-5 space-y-5">
        {applicationId && currentRunMatches && run?.status === "succeeded" ? <MarkdownExportControl applicationId={applicationId} /> : null}
        <div className="grid grid-cols-2 sm:grid-cols-4" aria-label="简历差距摘要">{(["resume_omission", "partial_coverage", "missing_evidence", "covered"] as const).map((group, index) => <div key={group} className={summaryCellClass(index)}><p className="text-xs font-bold text-[var(--ink-muted)]">{gapLabels[group]}</p><p className="mt-1 text-xl font-black">{grouped[group].length}</p></div>)}</div>
        {!actionGroups.length && currentItems.length > 0 && historicalItems.length === 0 ? <p className="border-b border-[var(--line)] pb-4 text-sm font-semibold">{stale ? "旧快照记录的简历覆盖了当时分析的要求。" : "这份简历已覆盖当前 JD 要求。已覆盖项目仍可在下方展开查看。"}</p> : null}
        {actionGroups.map((group) => <section key={group} aria-labelledby={`gap-group-${group}`}><div className="flex items-center justify-between border-b border-[var(--line)] pb-2"><h3 id={`gap-group-${group}`} className="text-sm font-black">{gapLabels[group]}</h3><span className="text-xs font-bold text-[var(--ink-muted)]">{grouped[group].length}</span></div><div>{grouped[group].map((item) => <GapRow key={item.id} item={item} />)}</div></section>)}
        <details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer list-none text-sm font-black"><span className="inline-flex items-center gap-2"><span aria-hidden="true">›</span>{gapLabels.covered}<span className="text-xs font-bold text-[var(--ink-muted)]">{grouped.covered.length}</span></span></summary><div className="mt-3">{grouped.covered.map((item) => <GapRow key={item.id} item={item} />)}</div></details>
      </div> : null}
      {historicalItems.length ? <details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer list-none text-sm font-black">历史差距快照 <span className="ml-2 text-xs font-bold text-[var(--ink-muted)]">{historicalItems.length} 项</span></summary><div className="mt-3">{historicalItems.map((item) => <HistoricalRow key={item.id} item={item} />)}</div></details> : null}
    </section>
  );
}
