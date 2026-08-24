import Link from "next/link";
import { redirect } from "next/navigation";

import { getOwnedProfile } from "@/features/account/repository";
import { dashboardJDActionLabel } from "@/features/applications/dashboard-copy";
import { applicationRepository } from "@/features/applications/repository";
import { APPLICATION_STAGE_LABELS } from "@/features/applications/schemas";
import { summarizeApplications } from "@/features/applications/summary";
import { careerFactRepository } from "@/features/career-profile/repository";
import { listOwnedJobs } from "@/features/jobs/repository";
import { listAssets } from "@/features/source-assets/repository";
import { DashboardUpload } from "@/features/source-assets/dashboard-upload";
import { requireUser } from "@/lib/auth/require-user";

export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await getOwnedProfile(user.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");

  const [assets, facts, jobs, applications] = await Promise.all([
    listAssets(user.id),
    careerFactRepository.list(user.id),
    listOwnedJobs(user.id),
    applicationRepository.list(user.id),
  ]);

  const activeJob = jobs.find(
    (job) => job.status === "queued" || job.status === "running",
  );
  const pendingFacts = facts.filter(
    (fact) => fact.confirmationStatus !== "confirmed",
  );
  const confirmedCount = facts.length - pendingFacts.length;
  const applicationSummary = summarizeApplications(applications);

  let primaryState;
  if (assets.length === 0) {
    primaryState = (
      <article className="sticker-border sticker-shadow bg-white p-5 sm:p-7">
        <span className="status-chip status-yellow">第一步</span>
        <h2 className="heading-font mt-4 text-2xl font-black">上传一份已有简历</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
          系统先在服务器提取 PDF 或 DOCX 文字；只有你授权后，才会将文字发送给 AI 分析。
        </p>
        <div className="mt-6 max-w-2xl">
          <DashboardUpload />
        </div>
      </article>
    );
  } else if (activeJob || assets.some((asset) => asset.status === "extracting")) {
    primaryState = (
      <article className="sticker-border sticker-shadow bg-white p-6 sm:p-8">
        <span className="status-chip status-blue">处理中</span>
        <h2 className="heading-font mt-4 text-2xl font-black">正在整理你的职业事实</h2>
        <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
          任务已经安全保存。你可以离开此页继续浏览，稍后回来查看结果。
        </p>
        <progress className="mt-6 h-2 w-full max-w-xl accent-[var(--coral)]" />
        <Link href="/applications" className="button-secondary mt-6 inline-flex min-h-11 items-center px-5 text-sm font-black">
          先看看我的投递
        </Link>
      </article>
    );
  } else if (pendingFacts.length > 0) {
    primaryState = (
      <article className="sticker-border sticker-shadow bg-white p-6 sm:p-8">
        <span className="status-chip bg-[var(--coral)] text-white">需要你判断</span>
        <h2 className="heading-font mt-4 text-2xl font-black">继续核对职业档案</h2>
        <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
          还有 {pendingFacts.length} 条事实等待确认或补充。未确认内容不会被写进正式简历。
        </p>
        <div className="mt-5 h-3 max-w-xl overflow-hidden rounded-full border-2 border-[var(--ink)] bg-[var(--canvas)]">
          <div className="h-full bg-[var(--mint)]" style={{ width: `${facts.length ? (confirmedCount / facts.length) * 100 : 0}%` }} />
        </div>
        <Link href="/profile" className="button-primary mt-6 inline-flex min-h-11 items-center px-5 text-sm font-black">
          继续核对职业档案 →
        </Link>
      </article>
    );
  } else {
    primaryState = (
      <article className="sticker-border sticker-shadow bg-[var(--mint)] p-6 sm:p-8">
        <span className="status-chip bg-white">✓ 已完成核对</span>
        <h2 className="heading-font mt-4 text-3xl font-black">职业档案已就绪</h2>
        <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
          已确认 {confirmedCount} 条真实事实。下一阶段可用它们匹配 JD、定制简历和准备面试。
        </p>
        <Link href="/applications/new" className="button-primary mt-6 inline-flex min-h-11 items-center px-5 text-sm font-black">
          {dashboardJDActionLabel(applications.length)} →
        </Link>
      </article>
    );
  }

  return (
    <section className="min-w-0">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.15em] text-[var(--ink-muted)]">今天的工作台</p>
        <h1 className="heading-font mt-2 break-words text-4xl font-black tracking-[-0.04em] sm:text-5xl">
          {profile.displayName ? `${profile.displayName}，继续推进` : "继续推进你的求职"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
          当前目标：{profile.targetRole ?? "尚未填写目标岗位"}
        </p>
      </div>
      <div className="mt-8">{primaryState}</div>

      <section className="mt-10" aria-labelledby="application-progress-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              真实申请记录
            </p>
            <h2 id="application-progress-heading" className="heading-font mt-1 text-2xl font-black">
              投递进度一眼看清
            </h2>
          </div>
          <Link href="/applications" className="text-sm font-black underline decoration-[var(--mist-blue)] decoration-2 underline-offset-4">
            查看全部投递 →
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["总记录", applicationSummary.total, "包含全部历史"],
            ["进行中", applicationSummary.active, "不含拒绝与撤回"],
            ["面试中", applicationSummary.interviews, "当前阶段"],
            ["Offer", applicationSummary.offers, "当前阶段"],
          ].map(([label, value, note], index) => (
            <article
              key={label}
              className={`rounded-2xl border p-4 ${
                index === 0
                  ? "border-2 border-[var(--ink)] bg-[var(--cream)] shadow-[3px_3px_0_var(--ink)]"
                  : "border-[var(--line)] bg-white"
              }`}
            >
              <p className="text-xs font-black text-[var(--ink-muted)]">{label}</p>
              <p className="mt-2 text-3xl font-black tabular-nums">{value}</p>
              <p className="mt-1 text-[10px] font-semibold text-[var(--ink-soft)]">{note}</p>
            </article>
          ))}
        </div>

        {applicationSummary.recent.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <h3 className="text-sm font-black">最近更新</h3>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {applicationSummary.recent.map((application) => (
                <li key={application.id}>
                  <Link href={`/applications/${application.id}`} className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-[var(--canvas)]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">{application.companyName}</span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--ink-muted)]">{application.roleTitle}</span>
                    </span>
                    <span className="status-chip bg-[var(--mist-blue)]">
                      {APPLICATION_STAGE_LABELS[application.stage]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <article className="mt-5 rounded-2xl border border-dashed border-[var(--ink-soft)] bg-white p-5">
            <p className="text-sm font-bold">还没有真实申请记录。</p>
            <Link href="/applications/new" className="mt-3 inline-flex text-sm font-black underline underline-offset-4">
              新建申请工作区
            </Link>
          </article>
        )}
      </section>

      <p className="mt-7 text-xs font-medium leading-5 text-[var(--ink-muted)]">
        数据说明：页面只展示你的真实记录，不填充演示投递或虚构经历。
      </p>
    </section>
  );
}
