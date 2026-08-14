import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { applicationRepository } from "@/features/applications/repository";
import {
  createResumeVersionAction,
  reviewResumeSuggestionAction,
} from "@/features/resume-customization/actions";
import { resumeCustomizationRepository } from "@/features/resume-customization/repository";
import { ResumeEditor } from "@/features/resume-customization/resume-editor";
import { ResumeExportActions } from "@/features/resume-customization/resume-export-actions";
import type {
  ResumeSection,
  ResumeVersion,
} from "@/features/resume-customization/schemas";
import { requireUser } from "@/lib/auth/require-user";

const sectionLabels: Record<ResumeSection, string> = {
  summary: "职业摘要",
  experience: "工作经历",
  project: "项目经历",
  education: "教育背景",
  skills: "技能",
  certification: "证书",
  language: "语言",
  achievement: "量化成果",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function VersionViewer({
  applicationId,
  companyName,
  roleTitle,
  version,
}: {
  applicationId: string;
  companyName: string;
  roleTitle: string;
  version: ResumeVersion;
}) {
  const sections = [...new Set(version.items.map((item) => item.section))];
  return (
    <section>
      <div className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--mint)] p-5 shadow-[3px_3px_0_var(--ink)] sm:flex sm:items-end sm:justify-between sm:gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="status-chip bg-white">V{version.versionNumber}</span>
            <span className="status-chip bg-[var(--cream)]">不可变快照</span>
          </div>
          <h1 className="heading-font mt-3 text-3xl font-black">
            {roleTitle} · {companyName}
          </h1>
          <p className="mt-2 text-xs font-semibold text-[var(--ink-muted)]">
            {formatDate(version.createdAt)} · {version.template === "modern" ? "现代" : "简洁"}模板
          </p>
        </div>
        <div className="mt-4 max-w-md sm:mt-0 sm:text-right">
          <p className="text-xs font-semibold leading-5 text-[var(--ink-muted)]">
            这个版本不会被后续编辑覆盖。即使职业档案发生变化，下面仍保留创建当时的事实快照。
          </p>
          <div className="mt-3">
            <ResumeExportActions
              applicationId={applicationId}
              versionId={version.id}
            />
          </div>
          <p className="mt-2 text-[10px] font-bold leading-4 text-[var(--ink-muted)]">
            导出不调用 AI、不产生模型费用。含中文等非拉丁文字时请优先使用 DOCX。
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="min-h-[720px] border border-[var(--line)] bg-white px-6 py-8 shadow-[0_12px_32px_rgba(41,55,51,0.08)] sm:px-10">
          <header className="border-b-2 border-[var(--ink)] pb-5">
            <p className="heading-font text-2xl font-black">{roleTitle}</p>
            <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
              Tailored for {companyName}
            </p>
          </header>
          {sections.map((section) => (
            <section key={section} className="mt-6">
              <h2 className="text-xs font-black uppercase tracking-[0.14em]">
                {sectionLabels[section]}
              </h2>
              <div className="mt-3 space-y-3">
                {version.items
                  .filter((item) => item.section === section)
                  .map((item) => (
                    <p key={item.id} className="text-sm font-medium leading-6">
                      {item.content}
                    </p>
                  ))}
              </div>
            </section>
          ))}
        </article>

        <aside className="space-y-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Audit trail
            </p>
            <h2 className="heading-font mt-1 text-xl font-black">事实来源</h2>
          </div>
          {version.items.map((item, index) => (
            <article
              key={item.id}
              className="rounded-2xl border border-[var(--line)] bg-white p-4"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                {String(index + 1).padStart(2, "0")} · {sectionLabels[item.section]}
              </p>
              <p className="mt-2 text-sm font-bold leading-6">{item.content}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
                {item.reason}
              </p>
              <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
                {item.evidence.map((evidence) => (
                  <div
                    key={`${item.id}:${evidence.factSnapshot.id}`}
                    className="rounded-xl bg-[var(--canvas)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black">
                        {evidence.factSnapshot.data.title}
                      </p>
                      <span className="status-chip bg-[var(--mint)]">
                        创建时已确认
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-5 text-[var(--ink-muted)]">
                      {evidence.factSnapshot.data.description}
                    </p>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                      {evidence.careerFactId
                        ? "仍关联职业档案"
                        : "原事实已删除，仅保留历史快照"}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </aside>
      </div>
    </section>
  );
}

export default async function ResumeResourcePage({
  params,
}: {
  params: Promise<{ id: string; resourceId: string }>;
}) {
  const user = await requireUser();
  const { id, resourceId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(resourceId).success) {
    notFound();
  }
  const application = await applicationRepository.get(user.id, id);
  if (!application) notFound();

  const run = await resumeCustomizationRepository.getOwned(user.id, resourceId);
  if (run?.applicationId === application.id && run.status === "succeeded") {
    const [suggestions, versions] = await Promise.all([
      resumeCustomizationRepository.listSuggestions(user.id, run.id),
      resumeCustomizationRepository.listVersions(user.id, application.id),
    ]);
    return (
      <div className="min-w-0">
        <Link
          href={`/applications/${application.id}?tab=resume`}
          className="mb-5 inline-flex text-xs font-black underline underline-offset-4"
        >
          ← 返回简历版本
        </Link>
        <ResumeEditor
          applicationId={application.id}
          runId={run.id}
          companyName={application.companyName}
          roleTitle={application.roleTitle}
          suggestions={suggestions}
          versions={versions}
          reviewSuggestion={reviewResumeSuggestionAction}
          saveVersion={createResumeVersionAction}
        />
      </div>
    );
  }

  const version = await resumeCustomizationRepository.getVersion(
    user.id,
    application.id,
    resourceId,
  );
  if (!version) notFound();
  return (
    <div className="min-w-0">
      <Link
        href={`/applications/${application.id}?tab=resume`}
        className="mb-5 inline-flex text-xs font-black underline underline-offset-4"
      >
        ← 返回简历版本
      </Link>
      <VersionViewer
        applicationId={application.id}
        companyName={application.companyName}
        roleTitle={application.roleTitle}
        version={version}
      />
    </div>
  );
}
