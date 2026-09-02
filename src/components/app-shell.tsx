import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/app/(app)/actions";

import { appNavigation } from "./app-navigation";
import { NavLink } from "./nav-link";

type AppShellProps = {
  children: ReactNode;
  email?: string;
};

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8.7" cy="8.7" r="5" />
      <path d="m12.5 12.5 3.5 3.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 8.2a4.5 4.5 0 0 1 9 0c0 4 1.5 4.6 1.5 4.6H4s1.5-.6 1.5-4.6Z" />
      <path d="M8 15.4h4" />
    </svg>
  );
}

function DisabledControl({
  label,
  children,
  coral = false,
}: {
  label: string;
  children: ReactNode;
  coral?: boolean;
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={`${label}-tooltip`}
        className={`flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-3 text-sm font-extrabold ${
          coral
            ? "border-2 border-[var(--ink)] bg-[var(--coral)] text-white shadow-[2px_2px_0_var(--ink)]"
            : "bg-white text-[var(--ink-muted)]"
        }`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        id={`${label}-tooltip`}
        className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-30 hidden w-max rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-xs font-bold text-white shadow-lg group-focus-within:block group-hover:block"
      >
        即将开放
      </span>
    </span>
  );
}

export function AppShell({ children, email }: AppShellProps) {
  const displayEmail = email ?? "已验证账户";

  return (
    <div className="min-h-screen bg-[var(--canvas)] md:grid md:grid-cols-[244px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[244px] flex-col border-r-2 border-[var(--ink)] bg-[var(--mint)] p-4 md:flex" aria-label="主导航">
        <Link href="/app" className="group flex items-center gap-3 px-2 py-2" aria-label="求职搭子首页">
          <span className="logo-mark flex size-10 rotate-[-3deg] items-center justify-center bg-[var(--cream)] text-lg font-black transition-transform group-hover:rotate-0">J</span>
          <div>
            <span className="heading-font block text-lg font-black leading-none">求职搭子</span>
            <span className="mt-1 block text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Job desk</span>
          </div>
        </Link>

        <Link href="/applications/new" className="mt-6 flex min-h-12 items-center justify-center rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-4 text-sm font-black shadow-[3px_3px_0_var(--ink)] transition-transform hover:-translate-y-0.5">
          ＋ 新建申请
        </Link>

        <nav className="mt-6 space-y-2">
          {appNavigation.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="mt-auto rounded-xl border border-[color:var(--ink-soft)] bg-white/55 p-3">
          <p className="text-xs font-black">资料安全原则</p>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--ink-muted)]">AI 写入前会先让你确认，不会静默改档案。</p>
        </div>
      </aside>

      <div className="min-w-0 md:col-start-2">
        <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[color:var(--canvas)]/95 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/app" className="flex shrink-0 items-center gap-2 md:hidden" aria-label="求职搭子首页">
              <span className="logo-mark flex size-9 items-center justify-center bg-[var(--cream)] text-sm font-black">J</span>
              <span className="heading-font hidden text-base font-black sm:inline">求职搭子</span>
            </Link>

            <DisabledControl label="全局搜索">
              <SearchIcon />
              <span className="hidden min-w-32 text-left font-medium lg:inline">搜索职位、事实、题目</span>
              <kbd className="hidden rounded border border-[var(--line)] bg-[var(--canvas)] px-1.5 py-0.5 text-[10px] font-bold xl:inline">⌘K</kbd>
            </DisabledControl>

            <div className="ml-auto flex items-center gap-2">
              <DisabledControl label="通知">
                <span className="relative">
                  <BellIcon />
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-white bg-[var(--coral)]" />
                </span>
                <span className="sr-only">通知</span>
              </DisabledControl>
              <DisabledControl label="AI助手" coral>
                <span className="text-xs font-black">AI</span>
                <span className="hidden sm:inline">助手</span>
              </DisabledControl>

              <details className="group relative">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="flex size-6 items-center justify-center rounded-lg bg-[var(--mist-blue)] text-xs font-black">{displayEmail.slice(0, 1).toUpperCase()}</span>
                  <span className="hidden max-w-36 truncate text-xs font-bold lg:inline">{displayEmail}</span>
                  <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 rounded-2xl border-2 border-[var(--ink)] bg-white p-2 shadow-[4px_4px_0_var(--ink)]">
                  <div className="border-b border-[var(--line)] px-3 py-2.5">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">已验证账户</p>
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
