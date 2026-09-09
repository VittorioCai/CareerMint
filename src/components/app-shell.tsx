import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/app/(app)/actions";

import { appNavigation } from "./app-navigation";
import { NavLink } from "./nav-link";

type AppShellProps = {
  children: ReactNode;
  email?: string;
};

export function AppShell({ children, email }: AppShellProps) {
  const displayEmail = email ?? "已验证账户";

  return (
    <div className="min-h-screen bg-[var(--canvas)] md:grid md:grid-cols-[244px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[244px] flex-col border-r border-[var(--line)] bg-[var(--canvas)] p-4 md:flex" aria-label="主导航">
        <Link href="/app" className="group flex items-center gap-3 px-2 py-2" aria-label="求职搭子首页">
          <span aria-hidden="true" className="logo-mark size-10" />
          <div>
            <span className="heading-font block text-base font-extrabold leading-none tracking-[-0.02em]">求职搭子</span>
            <span className="mt-1 block type-eyebrow text-[var(--ink-muted)]">Job desk</span>
          </div>
        </Link>

        <Link href="/applications/new" className="press mt-6 flex min-h-11 items-center justify-center rounded-[10px] border border-[var(--ink)] bg-[var(--cream)] px-4 text-sm font-bold hover:shadow-[0_6px_14px_-10px_var(--ink)]">
          ＋ 新建申请
        </Link>

        <nav className="mt-6 space-y-0.5">
          {appNavigation.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="mt-auto shrink-0 border-t border-[var(--line)] px-3 pb-3 pt-3.5">
          <p className="text-xs font-semibold">资料安全原则</p>
          <p className="mt-1 text-xs font-normal leading-[1.55] text-[var(--ink-muted)]">AI 写入前会先让你确认，不会静默改档案。</p>
        </div>
      </aside>

      <div className="min-w-0 md:col-start-2">
        <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[color:var(--canvas)]/95 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/app" className="flex shrink-0 items-center gap-2 md:hidden" aria-label="求职搭子首页">
              <span aria-hidden="true" className="logo-mark size-9" />
              <span className="heading-font hidden text-base font-black sm:inline">求职搭子</span>
            </Link>

            {/* Search, notifications and an AI entry point all sat here saying
                "即将开放". Three controls that do nothing, in the strip the eye
                reaches first on every screen — an empty placeholder costs more
                trust than an absent feature. */}
            <div className="ml-auto flex items-center gap-2">

              <details className="group relative">
                <summary className="press flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-[var(--line)] bg-white px-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="flex size-6 items-center justify-center rounded-lg bg-[var(--mist-blue)] text-xs font-black">{displayEmail.slice(0, 1).toUpperCase()}</span>
                  <span className="hidden max-w-36 truncate text-xs font-medium lg:inline">{displayEmail}</span>
                  <span aria-hidden="true" className="text-xs text-[var(--ink-muted)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-open:rotate-180">⌄</span>
                </summary>
                <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 rounded-2xl border-2 border-[var(--ink)] bg-white p-2 shadow-[4px_4px_0_var(--ink)]">
                  <div className="border-b border-[var(--line)] px-3 py-2.5">
                    <p className="type-eyebrow text-[var(--ink-muted)]">已验证账户</p>
                    <p className="mt-1 truncate text-sm font-bold">{displayEmail}</p>
                  </div>
                  <Link href="/settings/account" className="mt-1 block rounded-lg px-3 py-2 text-sm font-bold hover:bg-[var(--canvas)]">账户设置</Link>
                  <Link href="/settings/privacy" className="block rounded-lg px-3 py-2 text-sm font-bold hover:bg-[var(--canvas)]">AI 与数据授权</Link>
                  <form action={signOut} className="mt-1 border-t border-[var(--line)] pt-1">
                    <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--error)] hover:bg-[#fff0ee]">退出登录</button>
                  </form>
                </div>
              </details>
            </div>
          </div>

          <nav className="mt-3 flex flex-wrap gap-2 pb-1 md:hidden" aria-label="移动端主导航">
            <Link
              href="/applications/new"
              aria-label="移动端新建申请"
              className="flex shrink-0 items-center justify-center rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2.5 text-sm font-black shadow-[2px_2px_0_var(--ink)]"
            >
              ＋ 新建申请
            </Link>
            {appNavigation.map((item) => (
              <NavLink key={item.href} {...item} compact />
            ))}
          </nav>
        </header>

        <main className="min-h-[calc(100vh-65px)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>
      </div>

    </div>
  );
}
