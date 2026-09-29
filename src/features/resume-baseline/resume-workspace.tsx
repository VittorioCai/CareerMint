import Link from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/en";

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
  copy,
  applicationId,
  mode,
  baselineSelector,
}: {
  applicationId: string;
  mode: ResumeWorkspaceMode;
  baselineSelector: ReactNode;
  copy: Dictionary["resume"];
}) {
  return (
    <div className="space-y-6">
      <header>
        <h2 id="resume-gap-page-title" className="heading-font text-3xl font-bold">{copy.workspaceTitle}</h2>
        <p className="mt-2 type-caption text-[var(--ink-muted)]">{copy.workspaceBody}</p>
      </header>
      {baselineSelector}
      <section className="dense-surface min-w-0 p-5 sm:p-6" aria-labelledby="resume-next-step-title">
        <p id="resume-next-step-title" className="type-caption text-[var(--ink-muted)]">
          {mode === "no-baseline"
            ? copy.workspaceHint
            : copy.workspaceReady}
        </p>
        {/* Only once there is something to analyse. Without a resume the
            analysis page can do one thing, which is send the reader back
            here. */}
        {mode === "ready" ? (
          <Link
            href={`/applications/${applicationId}?tab=difference`}
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            {copy.workspaceNext}
          </Link>
        ) : null}
      </section>
    </div>
  );
}
