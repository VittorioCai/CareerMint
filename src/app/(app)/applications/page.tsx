import { cookies } from "next/headers";
import Link from "next/link";

import {
  ApplicationList,
  filterApplications,
} from "@/features/applications/application-list";
import {
  deleteApplicationAction,
  rememberApplicationViewAction,
} from "@/features/applications/actions";
import { applicationRepository } from "@/features/applications/repository";
import {
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABELS,
  APPLICATION_VIEW_COOKIE,
  applicationFilterSchema,
  resolveApplicationView,
} from "@/features/applications/schemas";
import { requireUser } from "@/lib/auth/require-user";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const store = await cookies();
  const filter = applicationFilterSchema.parse({
    view: resolveApplicationView(
      first(raw.view),
      store.get(APPLICATION_VIEW_COOKIE)?.value,
    ),
    q: first(raw.q),
    stage: first(raw.stage),
  });
  const applications = await applicationRepository.list(user.id);
  const visibleApplications = filterApplications(applications, filter);

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
            申请工作台
          </p>
          <h1 className="heading-font mt-2 type-page-title">
            我的投递
          </h1>
          <p className="mt-3 text-sm font-medium text-[var(--ink-muted)]">
            共 {applications.length} 份真实记录，当前筛选显示 {visibleApplications.length} 份。
          </p>
        </div>
      </div>

      <details
        className="reveal group mt-7"
        open={Boolean(filter.q || filter.stage) || applications.length > 8}
      >
        <summary className="press text-action inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--paper)] px-3.5 text-sm font-medium text-[var(--ink-muted)] marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
          筛选与搜索
          {filter.q || filter.stage ? (
            <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--ink)]">
              已启用
            </span>
          ) : null}
          <span
            aria-hidden="true"
            className="text-xs transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        <form method="get" className="soft-surface mt-3 grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input type="hidden" name="view" value={filter.view} />
          <label className="text-xs font-semibold text-[var(--ink-muted)]">
            搜索公司、职位、地点或来源
            <input
              name="q"
              defaultValue={filter.q}
              className="form-input mt-1.5"
              placeholder="例如 Acme、Product、Berlin"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--ink-muted)]">
            阶段
            <select name="stage" defaultValue={filter.stage ?? ""} className="form-input mt-1.5">
              <option value="">全部阶段</option>
              {APPLICATION_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {APPLICATION_STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="press inline-flex min-h-11 items-center rounded-[10px] border border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-semibold"
            >
              筛选
            </button>
            <Link
              href={`/applications?view=${filter.view}`}
              className="press inline-flex min-h-11 items-center rounded-[10px] border border-[var(--line)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink-muted)]"
            >
              清除
            </Link>
          </div>
        </form>
      </details>

      {/* Buttons, not links: this is a toggle whose choice is remembered, and
          only a Server Function can write the cookie that remembers it. The
          URL still carries `?view=` so a shared link shows what the sender
          saw. */}
      <form
        action={rememberApplicationViewAction}
        className="mt-5 inline-flex items-center gap-1 rounded-[10px] border border-[var(--line)] bg-[var(--paper)] p-1"
        aria-label="投递视图"
      >
        {(["board", "table"] as const).map((view) => (
          <button
            key={view}
            type="submit"
            name="view"
            value={view}
            aria-pressed={filter.view === view}
            className={`segment ${
              filter.view === view
                ? "bg-[var(--surface-muted)] font-semibold"
                : "font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {view === "board" ? "看板" : "表格"}
          </button>
        ))}
      </form>

      <div className="mt-5">
        <ApplicationList
          applications={visibleApplications}
          view={filter.view}
          deleteApplication={deleteApplicationAction.bind(null, {})}
        />
      </div>
    </section>
  );
}
