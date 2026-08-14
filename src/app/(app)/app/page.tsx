import Link from "next/link";
import { redirect } from "next/navigation";

import { getOwnedProfile } from "@/features/account/repository";
import { careerFactRepository } from "@/features/career-profile/repository";
import { listOwnedJobs } from "@/features/jobs/repository";
import { listAssets } from "@/features/source-assets/repository";
import { DashboardUpload } from "@/features/source-assets/dashboard-upload";
import { requireUser } from "@/lib/auth/require-user";

export default async function DashboardPage() {
  const user = await requireUser();
  const [profile, assets, facts, jobs] = await Promise.all([
    getOwnedProfile(user.id),
    listAssets(user.id),
    careerFactRepository.list(user.id),
    listOwnedJobs(user.id),
  ]);

  if (!profile?.onboardingCompletedAt) redirect("/onboarding");

  const activeJob = jobs.find(
    (job) => job.status === "queued" || job.status === "running",
  );
  const pendingFacts = facts.filter(
    (fact) => fact.confirmationStatus !== "confirmed",
  );
  const confirmedCount = facts.length - pendingFacts.length;

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
        <Link href="/profile" className="button-secondary mt-6 inline-flex min-h-11 items-center px-5 text-sm font-black">
          查看职业档案
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
      <p className="mt-7 text-xs font-medium leading-5 text-[var(--ink-muted)]">
        数据说明：页面只展示你的真实记录，不填充演示投递或虚构经历。
      </p>
    </section>
  );
}
