import Link from "next/link";

const workflow = [
  { index: "01", title: "保存职业事实", detail: "经历、项目与成果都有来源" },
  { index: "02", title: "拆解岗位要求", detail: "区分硬性要求与加分项" },
  { index: "03", title: "生成申请版本", detail: "每一处修改都能解释" },
];

const requirements = [
  { label: "增长实验经验", status: "有证据", tone: "mint" },
  { label: "跨团队协作", status: "有证据", tone: "blue" },
  { label: "德语 B2", status: "待确认", tone: "yellow" },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none">
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none">
      <path d="m4.5 10.5 3.2 3.2 7.8-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="landing-shell min-h-screen overflow-hidden">
      <nav className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10" aria-label="公开导航">
        <Link href="/" className="group flex items-center gap-3" aria-label="求职搭子首页">
          <span className="logo-mark sticker-border flex size-10 rotate-[-3deg] items-center justify-center bg-[var(--cream)] text-lg font-black transition-transform group-hover:rotate-0">J</span>
          <span className="heading-font text-xl font-black tracking-[-0.03em]">求职搭子</span>
          <span className="hidden rounded-full border border-[color:var(--ink-soft)] bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] sm:inline">Beta</span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-medium text-[var(--ink-muted)] md:inline">先建档，再为每个岗位定制</span>
          <Link href="/login" className="button-primary inline-flex min-h-11 items-center gap-2 px-4 text-sm font-extrabold sm:px-5">
            登录或注册
            <ArrowIcon />
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid w-full max-w-[1180px] gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[0.94fr_1.06fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-16">
        <div className="relative z-10 max-w-[620px]">
          <div className="mb-7 inline-flex rotate-[-1deg] items-center gap-2 rounded-full border-2 border-[var(--ink)] bg-[var(--mint)] px-4 py-2 text-sm font-extrabold shadow-[3px_3px_0_var(--ink)]">
            <span className="flex size-5 items-center justify-center rounded-full bg-white"><CheckIcon /></span>
            不编经历，只把真实优势说清楚
          </div>

          <h1 className="heading-font text-balance text-[clamp(3rem,7vw,6.3rem)] font-black leading-[0.96] tracking-[-0.065em]">
            让每次申请
            <span className="relative mt-2 block w-fit">
              都有依据
              <span aria-hidden="true" className="absolute -bottom-1 left-1 h-3 w-[96%] -rotate-1 bg-[var(--coral)] opacity-70 -z-10" />
            </span>
          </h1>

          <p className="mt-7 max-w-[560px] text-lg font-medium leading-8 text-[var(--ink-muted)] sm:text-xl">
            把职业档案、JD 匹配、简历版本、投递进度和面试准备放在同一个工作台。AI 只使用你确认过的事实，并告诉你每条建议从哪里来。
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/login" className="button-primary inline-flex min-h-14 items-center justify-center gap-3 px-6 text-base font-black">
              建立我的职业档案
              <ArrowIcon />
            </Link>
            <a href="#how-it-works" className="button-secondary inline-flex min-h-14 items-center justify-center px-6 text-base font-extrabold">
              看看怎么工作
            </a>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-[var(--ink-muted)]" aria-label="产品原则">
            <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--mint-strong)]" />事实有来源</li>
            <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--mist-blue)]" />修改可解释</li>
            <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--coral)]" />写入先确认</li>
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-[620px] lg:mx-0">
          <div aria-hidden="true" className="absolute -right-10 -top-10 size-36 rotate-12 rounded-[34px] border-2 border-[var(--ink)] bg-[var(--mist-blue)] max-sm:hidden" />
          <div aria-hidden="true" className="absolute -bottom-8 -left-8 size-24 -rotate-6 rounded-full border-2 border-[var(--ink)] bg-[var(--cream)] max-sm:hidden" />

          <div className="sticker-border sticker-shadow relative overflow-hidden bg-white">
            <div className="flex items-center justify-between border-b-2 border-[var(--ink)] bg-[var(--mint)] px-5 py-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[var(--ink-muted)]">申请工作区</p>
                <p className="heading-font mt-1 text-xl font-black">Senior Product Manager</p>
              </div>
              <div className="rounded-full border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-1.5 text-xs font-black">1 项待确认</div>
            </div>

            <div className="grid sm:grid-cols-[1fr_180px]">
              <div className="p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <p className="text-sm font-black">岗位要求</p>
                  <span className="text-xs font-bold text-[var(--ink-muted)]">3 项已解析</span>
                </div>
                <div className="space-y-3">
                  {requirements.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-[var(--ink)] bg-white"><CheckIcon /></span>
                        <span className="truncate text-sm font-bold">{item.label}</span>
                      </div>
                      <span className={`status-chip status-${item.tone}`}>{item.status}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 border-t border-dashed border-[var(--ink-soft)] pt-5">
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--ink)] bg-[var(--coral)] text-sm font-black text-white">AI</div>
                    <div>
                      <p className="text-sm font-black">有一项值得补充</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">你提到过德国市场项目，是否有可确认的语言使用场景？</p>
                    </div>
                  </div>
                </div>
              </div>

              <aside className="border-t-2 border-[var(--ink)] bg-[var(--canvas)] p-5 sm:border-l-2 sm:border-t-0" aria-label="申请状态">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">下一步</p>
                <p className="heading-font mt-2 text-lg font-black">确认 1 条事实</p>
                <div
                  className="mt-4 flex h-2 gap-1 overflow-hidden"
                  role="img"
                  aria-label="3 项要求中 2 项有证据，1 项待确认"
                >
                  <span className="h-full flex-1 rounded-full border border-[var(--ink)] bg-[var(--mint-strong)]" />
                  <span className="h-full flex-1 rounded-full border border-[var(--ink)] bg-[var(--mint-strong)]" />
                  <span className="h-full flex-1 rounded-full border border-[var(--ink)] bg-white" />
                </div>
                <p className="mt-2 text-xs font-bold text-[var(--ink-muted)]">3 项要求 · 2 项有证据</p>
                <button type="button" className="mt-6 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2.5 text-sm font-black shadow-[2px_2px_0_var(--ink)]">查看建议</button>
              </aside>
            </div>
          </div>

          <div className="absolute -right-3 -top-5 rotate-3 rounded-lg border-2 border-[var(--ink)] bg-[var(--coral)] px-3 py-1.5 text-xs font-black text-white shadow-[2px_2px_0_var(--ink)] sm:right-8">AI 建议有证据 ↗</div>
        </div>
      </section>

      <section id="how-it-works" className="border-y-2 border-[var(--ink)] bg-[var(--mint)]">
        <div className="mx-auto grid w-full max-w-[1180px] divide-y-2 divide-[var(--ink)] px-5 sm:px-8 md:grid-cols-3 md:divide-x-2 md:divide-y-0 lg:px-10">
          {workflow.map((item) => (
            <article key={item.index} className="grid grid-cols-[auto_1fr] gap-4 py-7 md:px-6 md:first:pl-0 md:last:pr-0">
              <span className="heading-font text-sm font-black text-[var(--ink-muted)]">{item.index}</span>
              <div>
                <h2 className="heading-font text-lg font-black">{item.title}</h2>
                <p className="mt-1 text-sm font-medium text-[var(--ink-muted)]">{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
