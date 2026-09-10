import Link from "next/link";
import type { ReactNode } from "react";

import type { Dictionary } from "@/i18n/dictionaries/en";
import { LanguageSwitch } from "@/i18n/language-switch";
import type { AppLocale } from "@/i18n/locale";

export type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthShellView({
  eyebrow,
  title,
  description,
  children,
  locale,
  dictionary,
}: AuthShellProps & { locale: AppLocale; dictionary: Dictionary }) {
  const { auth, common } = dictionary;
  const principles = [
    ["01", auth.principles.oneTitle, auth.principles.oneBody],
    ["02", auth.principles.twoTitle, auth.principles.twoBody],
    ["03", auth.principles.threeTitle, auth.principles.threeBody],
  ] as const;

  return (
    <main className="grid min-h-screen bg-[var(--canvas)] lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <section className="flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
        {/* The switch belongs here, not only in the account menu: English is
            the default, so a Chinese speaker meets an English page before they
            have an account to hold a preference. Signed out, this writes the
            cookie and nothing else. */}
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group flex w-fit items-center gap-3" aria-label={auth.backToHome}>
            <span aria-hidden="true" className="logo-mark size-10" />
            <span className="heading-font text-xl font-semibold">{common.productName}</span>
          </Link>
          <LanguageSwitch
            current={locale}
            label={common.language}
            onFailure={dictionary.shell.localeNotSaved}
          />
        </div>

        <div className="mx-auto my-auto w-full max-w-[480px] py-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">{eyebrow}</p>
          <h1 className="type-title heading-font">{title}</h1>
          <p className="mt-4 max-w-md text-base font-medium leading-7 text-[var(--ink-muted)]">{description}</p>
          <div className="mt-8">{children}</div>
        </div>

        <p className="text-xs font-semibold text-[var(--ink-muted)]">{auth.footer}</p>
      </section>

      <aside className="relative hidden overflow-hidden border-l border-[var(--line)] bg-[var(--surface-muted)] p-10 lg:flex lg:flex-col lg:justify-center" aria-label={auth.productPrinciples}>
        <div className="relative mx-auto w-full max-w-lg">
          <div className="mb-8 inline-flex rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-2 text-sm font-semibold">{auth.sidePanelBadge}</div>
          <h2 className="type-title heading-font max-w-md">{auth.sidePanelTitle}</h2>
          <div className="mt-9 border-y border-[var(--line)]">
            {principles.map(([index, heading, detail]) => (
              <div key={index} className="grid grid-cols-[48px_1fr] border-b border-[var(--line)] py-5 last:border-b-0">
                <span className="heading-font text-sm font-semibold text-[var(--ink-muted)]">{index}</span>
                <div>
                  <p className="heading-font text-lg font-semibold">{heading}</p>
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
