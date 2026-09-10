import { createApplicationAction } from "@/features/applications/actions";
import { SetupProgress } from "@/features/applications/setup-progress";
import { ApplicationDraftForm } from "@/features/applications/application-draft-form";
import { getDictionary } from "@/i18n/server";

export default async function NewApplicationPage() {
  const { applications: appsCopy } = await getDictionary();

  return (
    <section className="min-w-0">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
            {appsCopy.newPageEyebrow}
          </p>
          <h1 className="heading-font mt-2 type-page-title">
            {appsCopy.newPageTitle}
          </h1>
          <p className="mt-3 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
            {appsCopy.newPageBody}
          </p>
        </div>
        <aside className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">{appsCopy.dataBoundary}</p>
          <p className="mt-2 type-body font-medium">
            {appsCopy.dataBoundaryBody}
          </p>
        </aside>
      </div>

        <SetupProgress current="saved" />

      <div className="dense-surface mt-6 p-4 sm:p-7">
        <ApplicationDraftForm
          createApplication={createApplicationAction.bind(null, {})}
          copy={appsCopy}
        />
      </div>
    </section>
  );
}
