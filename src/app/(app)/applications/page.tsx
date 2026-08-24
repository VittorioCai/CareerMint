import Link from "next/link";

import {
  ApplicationList,
  filterApplications,
} from "@/features/applications/application-list";
import { deleteApplicationAction } from "@/features/applications/actions";
import { applicationRepository } from "@/features/applications/repository";
import {
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABELS,
  applicationFilterSchema,
} from "@/features/applications/schemas";
import { requireUser } from "@/lib/auth/require-user";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function viewHref(
  view: "board" | "table",
  q: string,
  stage?: string,
) {
  const params = new URLSearchParams({ view });
  if (q) params.set("q", q);
  if (stage) params.set("stage", stage);
  return `/applications?${params.toString()}`;
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const filter = applicationFilterSchema.parse({
    view: first(raw.view),
    q: first(raw.q),
    stage: first(raw.stage),
  });
  const applications = await applicationRepository.list(user.id);
  const visibleApplications = filterApplications(applications, filter);

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.15em] text-[var(--ink-muted)]">
            申请工作台
          </p>
          <h1 className="heading-font mt-2 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
            我的投递
          </h1>
          <p className="mt-3 text-sm font-medium text-[var(--ink-muted)]">
            共 {applications.length} 份真实记录，当前筛选显示 {visibleApplications.length} 份。
          </p>
        </div>
        <Link
          href="/applications/new"
          className="button-primary inline-flex min-h-12 items-center justify-center px-5 text-sm font-black"
        >
          ＋ 新建申请
        </Link>
      </div>

      <div className="dense-surface mt-7 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input type="hidden" name="view" value={filter.view} />
          <label className="text-xs font-black text-[var(--ink-muted)]">
            搜索公司、职位、地点或来源
            <input
              name="q"
              defaultValue={filter.q}
              className="form-input mt-1.5"
              placeholder="例如 Acme、Product、Berlin"
            />
          </label>
          <label className="text-xs font-black text-[var(--ink-muted)]">
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
            <button type="submit" className="button-secondary min-h-12 px-4 text-sm font-black">
              筛选
            </button>
            <Link href={`/applications?view=${filter.view}`} className="inline-flex min-h-12 items-center px-2 text-xs font-black underline underline-offset-4">
              清除
            </Link>
          </div>
        </form>
      </div>

      <div className="mt-5 flex items-center gap-2" aria-label="投递视图">
        <Link
          href={viewHref("board", filter.q, filter.stage)}
          aria-current={filter.view === "board" ? "page" : undefined}
          className={`rounded-xl border px-4 py-2 text-sm font-black ${filter.view === "board" ? "border-2 border-[var(--ink)] bg-[var(--cream)] shadow-[2px_2px_0_var(--ink)]" : "border-[var(--line)] bg-white"}`}
        >
          看板
        </Link>
        <Link
          href={viewHref("table", filter.q, filter.stage)}
          aria-current={filter.view === "table" ? "page" : undefined}
          className={`rounded-xl border px-4 py-2 text-sm font-black ${filter.view === "table" ? "border-2 border-[var(--ink)] bg-[var(--cream)] shadow-[2px_2px_0_var(--ink)]" : "border-[var(--line)] bg-white"}`}
        >
          表格
        </Link>
      </div>

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
