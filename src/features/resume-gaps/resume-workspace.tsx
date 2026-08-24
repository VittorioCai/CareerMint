import Link from "next/link";
import type { ReactNode } from "react";

type ResumeWorkspaceVersion = {
  id: string;
  versionNumber: number;
  template: "simple" | "modern";
  itemCount: number;
  createdAt: string;
};

export type ResumeWorkspaceMode = "no-jd" | "profile-only" | "comparison";

export function getResumeWorkspaceMode({
  analysisRunId,
  selectedAssetId,
}: {
  analysisRunId: string | null;
  selectedAssetId: string | null;
}): ResumeWorkspaceMode {
  if (!analysisRunId) return "no-jd";
  return selectedAssetId ? "comparison" : "profile-only";
}

export function isCurrentGapRun(
  run: { sourceAssetId: string | null; analysisRunId: string } | null,
  selectedAssetId: string | null,
  analysisRunId: string | null,
) {
  return Boolean(
    run &&
      selectedAssetId &&
      analysisRunId &&
      run.sourceAssetId === selectedAssetId &&
      run.analysisRunId === analysisRunId,
  );
}

export function ResumeWorkspace({
  applicationId,
  mode,
  baselineSelector,
  gapControl,
  gapPanel,
  versions,
}: {
  applicationId: string;
  mode: ResumeWorkspaceMode;
  baselineSelector: ReactNode;
  gapControl?: ReactNode;
  gapPanel?: ReactNode;
  versions: ResumeWorkspaceVersion[];
}) {
  return (
    <div className="space-y-6">
      <header>
        <h2 id="resume-gap-page-title" className="heading-font text-3xl font-black">简历差距</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ink-muted)]">只读比较当前 JD 与这次申请的对照简历，职业档案事实仅作为已确认补充。</p>
      </header>
      {baselineSelector}
      {mode === "no-jd" ? (
        <section className="dense-surface min-w-0 p-5 sm:p-6" aria-labelledby="resume-gap-empty-title">
          <p id="resume-gap-empty-title" className="text-sm font-semibold leading-6 text-[var(--ink-muted)]">先完成 JD 分析，才能判断简历差距。</p>
          <Link href={`/applications/${applicationId}?tab=jd`} className="mt-4 inline-flex min-h-11 items-center text-sm font-black underline underline-offset-4">返回 JD 分析 →</Link>
        </section>
      ) : null}
      {mode === "comparison" ? <>{gapControl}{gapPanel}</> : null}
      {mode === "profile-only" ? gapPanel : null}
      <section>
        <details className="dense-surface min-w-0 p-5 sm:p-6">
          <summary className="cursor-pointer list-none text-sm font-black">历史版本 <span className="ml-2 text-xs font-bold text-[var(--ink-muted)]">{versions.length} 个版本</span></summary>
          {versions.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {versions.map((version) => (
                <Link key={version.id} href={`/applications/${applicationId}/resume/${version.id}`} className="group rounded-2xl border border-[var(--line)] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[var(--ink)]">
                  <div className="flex items-center justify-between gap-3"><span className="status-chip bg-[var(--mint)]">V{version.versionNumber}</span><span className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">{version.template === "modern" ? "现代" : "简洁"}</span></div>
                  <p className="mt-4 text-sm font-black">{version.itemCount} 条已核对内容</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(version.createdAt))} · 不可变快照</p>
                  <p className="mt-4 text-xs font-black underline underline-offset-4">查看版本 →</p>
                </Link>
              ))}
            </div>
          ) : <p className="mt-4 text-sm font-semibold text-[var(--ink-muted)]">还没有简历版本。</p>}
        </details>
      </section>
    </div>
  );
}
