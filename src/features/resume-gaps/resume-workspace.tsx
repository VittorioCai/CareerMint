import Link from "next/link";
import type { ReactNode } from "react";

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
  leading,
  children,
}: {
  applicationId: string;
  mode: ResumeWorkspaceMode;
  leading?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h2 id="resume-gap-page-title" className="heading-font text-3xl font-black">简历差距</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ink-muted)]">只读比较当前 JD 与这次申请的对照简历，职业档案事实仅作为已确认补充。</p>
      </header>
      {leading}
      {mode === "no-jd" ? (
        <section className="dense-surface min-w-0 p-5 sm:p-6" aria-labelledby="resume-gap-empty-title">
          <p id="resume-gap-empty-title" className="text-sm font-semibold leading-6 text-[var(--ink-muted)]">先完成 JD 分析，才能判断简历差距。</p>
          <Link href={`/applications/${applicationId}?tab=jd`} className="mt-4 inline-flex min-h-11 items-center text-sm font-black underline underline-offset-4">返回 JD 分析 →</Link>
        </section>
      ) : null}
      {children}
    </div>
  );
}
