"use client";

import { useState, useTransition } from "react";

import { setInterfaceLocaleAction } from "./actions";
import { APP_LOCALES, LOCALE_LABEL, type AppLocale } from "./locale";

/**
 * EN / 中文.
 *
 * Each language names itself, in itself — a reader looking for their own
 * language finds it by recognising the word, not by translating a label they
 * cannot read. So these two strings are never localized.
 *
 * The current language is a pressed button rather than a link: it is a
 * setting, not a destination, and the URL deliberately does not change. The
 * page keeps its path, its query string, its application and its tab.
 */
export function LanguageSwitch({
  current,
  label,
  onFailure,
}: {
  current: AppLocale;
  /** Localized name for the control itself, e.g. "Language". */
  label: string;
  /** Localized message shown if the account preference could not be saved. */
  onFailure: string;
}) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        {APP_LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            lang={locale}
            disabled={pending}
            aria-pressed={locale === current}
            onClick={() => {
              if (locale === current) return;
              setFailed(false);
              startTransition(async () => {
                const result = await setInterfaceLocaleAction(locale);
                // The cookie is written either way, so the page is already in
                // the new language; what failed is remembering it on the
                // account. Saying so beats pretending it stuck.
                if (!result.ok) setFailed(true);
              });
            }}
            className={`segment min-w-11 text-xs ${
              locale === current
                ? "bg-[var(--surface-muted)] font-semibold"
                : "font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {LOCALE_LABEL[locale]}
          </button>
        ))}
      </div>
      {failed ? (
        <p role="alert" className="text-xs font-medium text-[var(--danger)]">
          {onFailure}
        </p>
      ) : null}
    </div>
  );
}
