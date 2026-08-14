import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

const principles = [
  ["01", "事实先确认", "AI 不会把猜测写进你的档案"],
  ["02", "申请可追溯", "简历版本和岗位要求放在一起"],
  ["03", "数据由你掌控", "随时导出，也可以删除账户数据"],
] as const;

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: AuthShellProps) {
  return (
    <main className="grid min-h-screen bg-[var(--canvas)] lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <section className="flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
        <Link href="/" className="group flex w-fit items-center gap-3" aria-label="返回求职搭子首页">
          <span className="logo-mark flex size-10 rotate-[-3deg] items-center justify-center bg-[var(--cream)] text-lg font-black transition-transform group-hover:rotate-0">J</span>
          <span className="heading-font text-xl font-black tracking-[-0.03em]">求职搭子</span>
        </Link>

        <div className="mx-auto my-auto w-full max-w-[480px] py-12">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[var(--ink-muted)]">{eyebrow}</p>
          <h1 className="heading-font text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-md text-base font-medium leading-7 text-[var(--ink-muted)]">{description}</p>
          <div className="mt-8">{children}</div>
        </div>

        <p className="text-xs font-semibold text-[var(--ink-soft)]">© 2026 求职搭子 · 先确认事实，再交给 AI</p>
      </section>

      <aside className="relative hidden overflow-hidden border-l-2 border-[var(--ink)] bg-[var(--mint)] p-10 lg:flex lg:flex-col lg:justify-center" aria-label="产品原则">
        <div aria-hidden="true" className="absolute -right-12 -top-12 size-48 rotate-12 rounded-[42px] border-2 border-[var(--ink)] bg-[var(--mist-blue)]" />
        <div aria-hidden="true" className="absolute -bottom-16 -left-12 size-44 rounded-full border-2 border-[var(--ink)] bg-[var(--cream)]" />
        <div className="relative mx-auto w-full max-w-lg">
          <div className="mb-8 inline-flex rotate-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--coral)] px-4 py-2 text-sm font-black text-white shadow-[3px_3px_0_var(--ink)]">你的海外求职工作台 ↗</div>
          <h2 className="heading-font max-w-md text-4xl font-black leading-[1.08] tracking-[-0.04em]">一份可信档案，复用到每次申请。</h2>
          <div className="mt-9 border-y-2 border-[var(--ink)]">
            {principles.map(([index, heading, detail]) => (
              <div key={index} className="grid grid-cols-[48px_1fr] border-b border-[color:var(--ink-soft)] py-5 last:border-b-0">
                <span className="heading-font text-sm font-black text-[var(--ink-muted)]">{index}</span>
                <div>
                  <p className="heading-font text-lg font-black">{heading}</p>
                  <p className="mt-1 text-sm font-medium text-[var(--ink-muted)]">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </main>
  );
}
