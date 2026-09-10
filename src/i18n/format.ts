import type { AppLocale } from "./locale";

/**
 * A calendar day, in the reader's language.
 *
 * This was `new Intl.DateTimeFormat("zh-CN", …)` written out three times, so
 * an English reader saw 2026年9月10日 next to English labels. The tag is the
 * *interface* language, not the job-search language: these are dates on the
 * reader's own records, and they belong in the language the page is in.
 *
 * `timeZone: "UTC"` stays. A stored date here is a day, not a moment, and
 * rendering it in the reader's zone moves it by one.
 */
export function formatDay(
  value: string,
  locale: AppLocale,
  month: "short" | "long" = "short",
) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month,
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
