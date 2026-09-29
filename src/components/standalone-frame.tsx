import Link from "next/link";
import type { ReactNode } from "react";

import type { Dictionary } from "@/i18n/dictionaries/en";
import { LanguageSwitch } from "@/i18n/language-switch";
import type { AppLocale } from "@/i18n/locale";

import { LogoMark } from "./logo-mark";

export type StandaloneFrameCopy = {
  locale: AppLocale;
  productName: string;
  homeLabel: string;
  languageLabel: string;
  localeNotSaved: string;
};

/** The five strings, picked out so a client component is handed only these. */
export function standaloneFrameCopy(
  locale: AppLocale,
  dictionary: Dictionary,
): StandaloneFrameCopy {
  return {
    locale,
    productName: dictionary.common.productName,
    homeLabel: dictionary.auth.backToHome,
    languageLabel: dictionary.common.language,
    localeNotSaved: dictionary.shell.localeNotSaved,
  };
}

/**
 * The page around something that has no page of its own: a wrong address, or
 * a route outside the signed-in shell that failed to render.
 *
 * Without it those were a heading and a button at the top of an empty canvas,
 * with nothing to say whose product this was and no way to change language —
 * on the two pages most likely to be the first a reader sees in the wrong one.
 * The header is the sign-in page's.
 */
export function StandaloneFrame({
  frame,
  children,
}: {
  frame: StandaloneFrameCopy;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas)]">
      <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
        <Link
          href="/"
          className="group flex min-h-11 w-fit items-center gap-3"
          aria-label={frame.homeLabel}
        >
          <LogoMark className="size-10" />
          <span className="heading-font text-xl font-semibold">
            {frame.productName}
          </span>
        </Link>
        <LanguageSwitch
          current={frame.locale}
          label={frame.languageLabel}
          onFailure={frame.localeNotSaved}
        />
      </header>
      {/* Centred, and nudged up: the optical middle of a page sits above its
          measured one, and the header has already taken its share of the top. */}
      <main className="flex flex-1 items-center pb-[12vh]">{children}</main>
    </div>
  );
}
