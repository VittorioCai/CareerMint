import Link from "next/link";

import { ApplicationDeleteControl } from "./application-delete-control";
import type { ApplicationActionState } from "./actions";

import {
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABELS,
  WORKPLACE_MODE_LABELS,
  type Application,
  type ApplicationFilter,
  type ApplicationStage,
} from "./schemas";

const stageTone: Record<ApplicationStage, string> = {
  preparing: "bg-[var(--surface-muted)]",
  applied: "bg-[var(--sev-minor)]",
  hr: "bg-[var(--paper)]",
  interview: "bg-[var(--sev-critical)] text-[var(--sev-critical-ink)]",
  offer: "bg-[var(--sev-matched)]",
  rejected: "bg-[var(--sev-gate)]",
  withdrawn: "bg-[var(--sev-minor)]",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function filterApplications(
  applications: Application[],
  filter: ApplicationFilter,
) {
  const query = filter.q.toLocaleLowerCase();
  return applications.filter((application) => {
    if (filter.stage && application.stage !== filter.stage) return false;
    if (!query) return true;
    return [
      application.companyName,
      application.roleTitle,
      application.location,
      application.source,
    ].some((value) => value?.toLocaleLowerCase().includes(query));
  });
}

function StageChip({ stage }: { stage: ApplicationStage }) {
  return (
    <span className={`status-chip ${stageTone[stage]}`}>
      {APPLICATION_STAGE_LABELS[stage]}
    </span>
  );
}

type DeleteApplication = (formData: FormData) => Promise<ApplicationActionState>;

function ApplicationCard({
  application,
  deleteApplication,
}: {
  application: Application;
  deleteApplication: DeleteApplication;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)] transition-transform hover:-translate-y-0.5 hover:border-[var(--ink-soft)]">
      <Link
        href={`/applications/${application.id}`}
        className="block p-4 focus-visible:outline-offset-[-3px]"
      >
        <span className="text-xs font-semibold text-[var(--ink-muted)]">
          {application.companyName}
        </span>
        <h3 className="mt-1 break-words text-sm font-semibold leading-5">
          {application.roleTitle}
        </h3>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold text-[var(--ink-muted)]">
          {application.location ? <span>{application.location}</span> : null}
          <span>· {WORKPLACE_MODE_LABELS[application.workplaceMode]}</span>
        </div>
        <p className="mt-3 border-t border-[var(--line)] pt-2 text-xs font-semibold text-[var(--ink-muted)]">
          更新于 {formatDate(application.updatedAt)}
        </p>
      </Link>
      <div className="px-4 pb-3">
        <ApplicationDeleteControl
          compact
          applicationId={application.id}
          companyName={application.companyName}
          roleTitle={application.roleTitle}
          deleteApplication={deleteApplication}
        />
      </div>
    </article>
  );
}

function EmptyApplications() {
  return (
    <article className="soft-surface bg-[var(--sev-matched)] p-6 sm:p-8">
      <span className="status-chip bg-[var(--paper)]">从一个真实岗位开始</span>
      <h2 className="heading-font mt-4 text-2xl font-bold">还没有投递记录</h2>
      <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
        粘贴一份正在考虑的 JD，系统会先为它建立独立工作区。没有示例数据，也不会替你自动投递。
      </p>
      <Link
        href="/applications/new"
        className="button-primary mt-6 inline-flex min-h-11 items-center px-5 text-sm font-semibold"
      >
        新建第一份申请
      </Link>
    </article>
  );
}

export function ApplicationList({
  applications,
  view,
  deleteApplication,
}: {
  applications: Application[];
  view: "board" | "table";
  deleteApplication: DeleteApplication;
}) {
  if (applications.length === 0) return <EmptyApplications />;

  if (view === "table") {
    return (
      <div className="scroll-x-affordance overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--paper)]">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="bg-[var(--canvas)] text-xs font-semibold text-[var(--ink-muted)]">
            <tr>
              {[
                "公司与职位",
                "地点",
                "阶段",
                "来源",
                "最后更新",
                "操作",
              ].map((heading) => (
                <th key={heading} scope="col" className="border-b border-[var(--line)] px-4 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr key={application.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--canvas)]">
                <td className="px-4 py-4">
                  <Link href={`/applications/${application.id}`} className="font-semibold underline decoration-[var(--ink-soft)] underline-offset-4">
                    {application.companyName} · {application.roleTitle}
                  </Link>
                </td>
                <td className="px-4 py-4 font-medium text-[var(--ink-muted)]">
                  {application.location ?? "未填写"}
                </td>
                <td className="px-4 py-4">
                  <StageChip stage={application.stage} />
                </td>
                <td className="px-4 py-4 font-medium text-[var(--ink-muted)]">
                  {application.source ?? "未填写"}
                </td>
                <td className="px-4 py-4 font-medium text-[var(--ink-muted)]">
                  {formatDate(application.updatedAt)}
                </td>
                <td className="min-w-56 px-4 py-4 align-top">
                  <ApplicationDeleteControl
                    compact
                    applicationId={application.id}
                    companyName={application.companyName}
                    roleTitle={application.roleTitle}
                    deleteApplication={deleteApplication}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="scroll-x-affordance snap-columns overflow-x-auto pb-4">
      <div className="grid min-w-[1780px] grid-cols-7 gap-4">
        {APPLICATION_STAGES.map((stage) => {
          const grouped = applications.filter(
            (application) => application.stage === stage,
          );
          return (
            <section
              key={stage}
              className="min-w-0"
            >
              <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--ink)] pb-2">
                <h2 className="text-sm font-semibold">{APPLICATION_STAGE_LABELS[stage]}</h2>
                <span className="text-xs font-semibold tabular-nums text-[var(--ink-muted)]">
                  {grouped.length}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {grouped.length > 0 ? (
                  grouped.map((application) => (
                    <ApplicationCard
                      key={application.id}
                      application={application}
                      deleteApplication={deleteApplication}
                    />
                  ))
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
