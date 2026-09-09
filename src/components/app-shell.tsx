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
      {/* A plain container, not an <aside>: the landmark that matters here is
          the <nav> inside it, and labelling the sidebar 主导航 announced the
          primary navigation as a complementary region. */}
      <div
        data-testid="sidebar"
        className="fixed inset-y-0 left-0 z-20 hidden w-[244px] flex-col border-r border-[var(--line)] bg-[var(--canvas)] p-4 md:flex"
      >
        <Link href="/app" className="group flex items-center gap-3 px-2 py-2" aria-label="求职搭子首页">
          <span aria-hidden="true" className="logo-mark size-10" />
          <div>
            <span className="heading-font block text-base font-semibold leading-none">求职搭子</span>
            <span className="mt-1 block type-eyebrow text-[var(--ink-muted)]">Job desk</span>
          </div>
        </Link>

        <Link href="/applications/new" className="press button-primary mt-6 flex min-h-11 items-center justify-center px-4 text-sm font-semibold">
          ＋ 新建申请
        </Link>

        <nav className="mt-6 space-y-0.5" aria-label="主导航">
          {appNavigation.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="mt-auto shrink-0 border-t border-[var(--line)] px-3 pb-3 pt-3.5">
          <p className="text-xs font-semibold">资料安全原则</p>
          <p className="mt-1 text-xs font-normal leading-[1.55] text-[var(--ink-muted)]">AI 写入前会先让你确认，不会静默改档案。</p>
        </div>
      </div>

      <div className="min-w-0 md:col-start-2">
        <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[color:var(--canvas)]/95 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/app" className="-my-1 flex min-h-11 min-w-11 shrink-0 items-center gap-2 md:hidden" aria-label="求职搭子首页">
              <span aria-hidden="true" className="logo-mark size-9" />
              <span className="heading-font hidden text-base font-semibold sm:inline">求职搭子</span>
            </Link>

            {/* Search, notifications and an AI entry point all sat here saying
                "即将开放". Three controls that do nothing, in the strip the eye
                reaches first on every screen — an empty placeholder costs more
                trust than an absent feature. */}
            <div className="ml-auto flex items-center gap-2">
              {/* The one action the whole product exists for. On a phone it is
                  a target beside the account menu rather than a fifth entry in
                  the navigation — it is not a place, it is a verb. */}
              <Link
                href="/applications/new"
                aria-label="新建申请"
                className="button-primary press flex size-11 items-center justify-center text-lg md:hidden"
              >
                <span aria-hidden="true">＋</span>
              </Link>

              <details className="group relative">
                <summary className="press flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--paper)] px-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="flex size-6 items-center justify-center rounded-lg bg-[var(--sev-minor)] text-xs font-semibold">{displayEmail.slice(0, 1).toUpperCase()}</span>
                  <span className="hidden max-w-36 truncate text-xs font-medium lg:inline">{displayEmail}</span>
                  <span aria-hidden="true" className="text-xs text-[var(--ink-muted)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-open:rotate-180">⌄</span>
                </summary>
                <div className="motion-enter absolute right-0 top-[calc(100%+8px)] z-30 w-64 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-2 shadow-[var(--elevation-2)]">
                  <div className="border-b border-[var(--line)] px-3 py-2.5">
                    <p className="type-eyebrow text-[var(--ink-muted)]">已验证账户</p>
                    <p className="mt-1 truncate text-sm font-bold">{displayEmail}</p>
                  </div>
                  <Link href="/settings/account" className="mt-1 block rounded-lg px-3 py-2 text-sm font-bold hover:bg-[var(--canvas)]">账户设置</Link>
                  <Link href="/settings/privacy" className="block rounded-lg px-3 py-2 text-sm font-bold hover:bg-[var(--canvas)]">AI 与数据授权</Link>
                  <form action={signOut} className="mt-1 border-t border-[var(--line)] pt-1">
                    <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--error)] hover:bg-[var(--danger-tint)]">退出登录</button>
                  </form>
                </div>
              </details>
            </div>
          </div>

        </header>

        {/* pb-24 on the phone is the bottom bar's height plus the home
            indicator; without it the last control on every page sits under
            the bar and cannot be tapped. */}
        <main className="min-h-[calc(100vh-65px)] px-4 pb-24 pt-6 sm:px-6 md:pb-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>
      </div>

      {/* Four destinations, four tabs — the thumb reaches the bottom of a
          phone and not the top of it. The safe-area padding keeps the labels
          above the home indicator on a notched device, and resolves to zero on
          one without. */}
      <nav
        aria-label="主导航"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-[var(--line)] bg-[color:var(--canvas)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        {appNavigation.map((item) => (
          <NavLink key={item.href} {...item} compact />
        ))}
      </nav>
    </div>
  );
}
