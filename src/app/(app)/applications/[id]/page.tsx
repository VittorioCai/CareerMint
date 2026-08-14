import Link from "next/link";
import { notFound } from "next/navigation";

import { changeApplicationStageAction } from "@/features/applications/actions";
import { applicationRepository } from "@/features/applications/repository";
import {
  APPLICATION_STAGE_LABELS,
  WORKPLACE_MODE_LABELS,
  type Application,
  type ApplicationStageEvent,
} from "@/features/applications/schemas";
import { StageUpdateForm } from "@/features/applications/stage-update-form";
import { AnalysisControl } from "@/features/jd-analysis/analysis-control";
import { jdAnalysisRepository } from "@/features/jd-analysis/repository";
import { RequirementsPanel } from "@/features/jd-analysis/requirements-panel";
import type {
  JDAnalysisRun,
  JDRequirementRecord,
} from "@/features/jd-analysis/schemas";
import { requireUser } from "@/lib/auth/require-user";

const tabs = ["overview", "jd", "resume", "interview", "timeline"] as const;
type DetailTab = (typeof tabs)[number];

const tabLabels: Record<DetailTab, string> = {
  overview: "概览",
  jd: "JD",
  resume: "简历",
  interview: "面试准备",
  timeline: "时间线",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function detailTab(value: string | undefined): DetailTab {
  return tabs.includes(value as DetailTab) ? (value as DetailTab) : "overview";
}

function formatDate(value: string | null) {
  if (!value) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function Overview({ application }: { application: Application }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["当前阶段", APPLICATION_STAGE_LABELS[application.stage]],
          ["阶段开始", formatDate(application.stageChangedAt)],
          ["首次投递", formatDate(application.appliedAt)],
          ["办公方式", WORKPLACE_MODE_LABELS[application.workplaceMode]],
          ["来源", application.source ?? "未填写"],
          ["下一步", application.nextAction ?? "尚未设置"],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-[var(--line)] bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              {label}
            </p>
            <p className="mt-2 break-words text-sm font-black">{value}</p>
          </article>
        ))}
      </div>
      <aside className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--cream)] p-5 shadow-[3px_3px_0_var(--ink)]">
        <p className="text-xs font-black uppercase tracking-[0.12em]">更新进度</p>
        <h2 className="heading-font mt-2 text-xl font-black">发生了什么？记下来</h2>
        <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
          每次更新都会保留发生日期和阶段事件，不会静默覆盖历史。
        </p>
        <div className="mt-4 border-t border-[color:var(--ink-soft)] pt-4">
          <StageUpdateForm
            key={`${application.id}:${application.stage}`}
            applicationId={application.id}
            currentStage={application.stage}
            changeStage={changeApplicationStageAction.bind(null, {})}
          />
        </div>
      </aside>
    </div>
  );
}

function JdPanel({
  application,
  analysisRun,
  requirements,
}: {
  application: Application;
  analysisRun: JDAnalysisRun | null;
  requirements: JDRequirementRecord[];
}) {
  return (
    <div className="space-y-6">
      <AnalysisControl
        applicationId={application.id}
        initialStatus={analysisRun?.status ?? null}
      />
      <RequirementsPanel requirements={requirements} />
      <article className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">原始快照</p>
            <h2 className="heading-font mt-1 text-xl font-black">JD 原文</h2>
          </div>
          {application.jobUrl ? (
            <a href={application.jobUrl} target="_blank" rel="noreferrer" className="button-secondary inline-flex min-h-10 items-center px-4 text-xs font-black">
              打开原岗位 ↗
            </a>
          ) : null}
        </div>
        <div className="mt-5 whitespace-pre-wrap break-words text-sm font-medium leading-7 text-[var(--ink-muted)]">
          {application.jdText}
        </div>
      </article>
    </div>
  );
}

function Timeline({ events }: { events: ApplicationStageEvent[] }) {
  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <time className="text-xs font-black text-[var(--ink-muted)]" dateTime={event.occurredAt}>
            {formatDate(event.occurredAt)}
          </time>
          <div>
            <p className="text-sm font-black">
              {event.fromStage
                ? `${APPLICATION_STAGE_LABELS[event.fromStage]} → ${APPLICATION_STAGE_LABELS[event.toStage]}`
                : `建立申请 · ${APPLICATION_STAGE_LABELS[event.toStage]}`}
            </p>
            {event.note ? (
              <p className="mt-1 text-sm font-medium leading-6 text-[var(--ink-muted)]">{event.note}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function FuturePanel({ type }: { type: "resume" | "interview" }) {
  const resume = type === "resume";
  return (
    <article className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--mist-blue)] p-6 shadow-[3px_3px_0_var(--ink)]">
      <span className="status-chip bg-white">下一切片</span>
      <h2 className="heading-font mt-4 text-2xl font-black">
        {resume ? "定制简历编辑器" : "岗位面试准备"}
      </h2>
      <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
        {resume
          ? "后续会把已确认职业事实与这份 JD 匹配，所有新增事实仍需你确认。"
          : "后续会组合通用题与岗位特定题，并把可能的问题明确标记为预测。"}
      </p>
    </article>
  );
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const activeTab = detailTab(first(query.tab));
  const application = await applicationRepository.get(user.id, id);
  if (!application) notFound();
  const [events, analysisRun, requirements] = await Promise.all([
    applicationRepository.listEvents(user.id, id),
    activeTab === "jd"
      ? jdAnalysisRepository.getLatest(user.id, id)
      : Promise.resolve(null),
    activeTab === "jd"
      ? jdAnalysisRepository.listRequirements(user.id, id)
      : Promise.resolve([]),
  ]);

  return (
    <section className="min-w-0">
      <Link href="/applications" className="text-xs font-black underline underline-offset-4">
        ← 返回我的投递
      </Link>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="status-chip bg-[var(--cream)]">{APPLICATION_STAGE_LABELS[application.stage]}</span>
            {application.location ? <span className="text-xs font-bold text-[var(--ink-muted)]">{application.location}</span> : null}
          </div>
          <h1 className="heading-font mt-3 break-words text-4xl font-black tracking-[-0.04em] sm:text-5xl">
            {application.roleTitle}
          </h1>
          <p className="mt-2 text-lg font-black text-[var(--ink-muted)]">{application.companyName}</p>
        </div>
        <Link href="/applications/new" className="button-secondary inline-flex min-h-11 items-center justify-center px-4 text-sm font-black">
          ＋ 新建申请
        </Link>
      </div>

      <nav className="mt-7 flex gap-2 overflow-x-auto border-b border-[var(--line)] pb-3" aria-label="申请详情">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/applications/${application.id}?tab=${tab}`}
            aria-current={activeTab === tab ? "page" : undefined}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-black ${activeTab === tab ? "border-2 border-[var(--ink)] bg-[var(--cream)] shadow-[2px_2px_0_var(--ink)]" : "border border-[var(--line)] bg-white"}`}
          >
            {tabLabels[tab]}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {activeTab === "overview" ? <Overview application={application} /> : null}
        {activeTab === "jd" ? (
          <JdPanel
            application={application}
            analysisRun={analysisRun}
            requirements={requirements}
          />
        ) : null}
        {activeTab === "timeline" ? <Timeline events={events} /> : null}
        {activeTab === "resume" ? <FuturePanel type="resume" /> : null}
        {activeTab === "interview" ? <FuturePanel type="interview" /> : null}
      </div>
    </section>
  );
}
