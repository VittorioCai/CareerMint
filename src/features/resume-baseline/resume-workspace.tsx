import Link from "next/link";
import type { ReactNode } from "react";

export type ResumeWorkspaceMode = "no-baseline" | "ready";

export function getResumeWorkspaceMode({
  selectedAssetId,
}: {
  selectedAssetId: string | null;
}): ResumeWorkspaceMode {
  return selectedAssetId ? "ready" : "no-baseline";
}

export function ResumeWorkspace({
  applicationId,
  mode,
  baselineSelector,
}: {
  applicationId: string;
  mode: ResumeWorkspaceMode;
  baselineSelector: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h2 id="resume-gap-page-title" className="heading-font text-3xl font-bold">对照简历</h2>
        <p className="mt-2 type-caption font-medium text-[var(--ink-muted)]">选定本次投递用来比对的简历。差异分析在“差异分析”页面进行。</p>
      </header>
      {baselineSelector}
      <section className="dense-surface min-w-0 p-5 sm:p-6" aria-labelledby="resume-next-step-title">
        <p id="resume-next-step-title" className="type-caption font-medium text-[var(--ink-muted)]">
          {mode === "no-baseline"
            ? "对照简历确定后，系统才能判断它与岗位要求之间的差异。"
            : "对照简历已确定，可以开始比对岗位要求了。"}
        </p>
        <Link
          href={`/applications/${applicationId}?tab=difference${mode === "no-baseline" ? "&setup=1" : ""}`}
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
        >
          前往差异分析 →
        </Link>
      </section>
    </div>
  );
}
