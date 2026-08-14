import Link from "next/link";

const setupSteps = [
  { title: "补充基本求职方向", detail: "目标岗位、国家与求职语言", status: "下一步" },
  { title: "上传一份现有简历", detail: "支持 PDF 与 DOCX，也可以稍后再做", status: "待开始" },
  { title: "逐条确认职业事实", detail: "确认后才能被 AI 确定性使用", status: "待开始" },
] as const;

export default function DashboardPage() {
  return (
    <section>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.15em] text-[var(--ink-muted)]">今天的工作台</p>
          <h1 className="heading-font mt-2 text-4xl font-black tracking-[-0.04em] sm:text-5xl">先建好你的职业档案</h1>
          <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-[var(--ink-muted)]">完成第一轮建档后，系统才能用真实经历匹配 JD、定制简历并生成岗位面试题。</p>
        </div>
        <Link href="/profile" className="button-primary inline-flex min-h-12 shrink-0 items-center justify-center px-5 text-sm font-black">继续建立档案 <span className="ml-2">→</span></Link>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(290px,0.6fr)]">
        <article className="sticker-border sticker-shadow bg-white p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full border border-[var(--ink)] bg-[var(--mint)] px-3 py-1 text-xs font-black">新用户起点</span>
              <h2 className="heading-font mt-4 text-2xl font-black">档案完成度</h2>
            </div>
            <span className="heading-font text-4xl font-black">0%</span>
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full border-2 border-[var(--ink)] bg-[var(--canvas)]" aria-label="档案完成度 0%">
            <div className="h-full w-0 bg-[var(--coral)]" />
          </div>

          <ol className="mt-7 divide-y divide-[var(--line)]">
            {setupSteps.map((step, index) => (
              <li key={step.title} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 py-4 first:pt-0 last:pb-0">
                <span className={`flex size-9 items-center justify-center rounded-xl border border-[var(--ink)] text-sm font-black ${index === 0 ? "bg-[var(--cream)]" : "bg-[var(--canvas)]"}`}>{index + 1}</span>
                <div>
                  <p className="text-sm font-black">{step.title}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--ink-muted)]">{step.detail}</p>
                </div>
                <span className={`hidden rounded-full border px-2.5 py-1 text-[11px] font-black sm:inline ${index === 0 ? "border-[var(--ink)] bg-[var(--cream)]" : "border-[var(--line)] text-[var(--ink-muted)]"}`}>{step.status}</span>
              </li>
            ))}
          </ol>
        </article>

        <aside className="space-y-5">
          <article className="dense-surface p-5">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">本周进展</p>
            <div className="mt-4 grid grid-cols-2 divide-x divide-[var(--line)]">
              <div>
                <p className="heading-font text-3xl font-black">0</p>
                <p className="mt-1 text-xs font-bold text-[var(--ink-muted)]">新增申请</p>
              </div>
              <div className="pl-4">
                <p className="heading-font text-3xl font-black">0</p>
                <p className="mt-1 text-xs font-bold text-[var(--ink-muted)]">待跟进</p>
              </div>
            </div>
            <p className="mt-5 border-t border-[var(--line)] pt-4 text-xs font-medium leading-5 text-[var(--ink-muted)]">建立第一条申请后，这里会显示真实统计，不使用演示数据。</p>
          </article>

          <article className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--coral)] p-5 text-white shadow-[3px_3px_0_var(--ink)]">
            <p className="text-xs font-black uppercase tracking-[0.12em]">AI 助手</p>
            <h2 className="heading-font mt-2 text-xl font-black">会在需要时出现</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-white/90">档案页找缺失资料，JD 页解释要求，简历页说明修改理由。所有写入都先预览。</p>
            <span className="mt-4 inline-flex rounded-full border border-white/70 px-3 py-1 text-xs font-black">即将开放</span>
          </article>
        </aside>
      </div>
    </section>
  );
}
