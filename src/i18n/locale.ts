/**
 * The interface language, and how it is decided.
 *
 * There are no locale-prefixed routes. That is a deliberate departure from
 * Next's own guide: this product's URLs are already in the wild in email
 * callbacks, bookmarks and shared application links, and prefixing them would
 * break all three to gain a property — a shareable "this page in English" URL
 * — that nobody has asked for. Language is a property of the reader, so it is
 * stored with the reader.
 *
 * Precedence, and the reason for each step:
 *
 *   1. `profiles.interface_locale` for a signed-in user. It is the only thing
 *      that follows them between devices, so it outranks the local cookie.
 *   2. The cookie, for a visitor who has no profile to read.
 *   3. English, because that is the default for anyone new.
 *
 * Browser `Accept-Language` is deliberately not consulted. The product
 * decision is English by default; guessing from the browser would send a
 * Chinese-speaking user to a Chinese interface that the product does not yet
 * treat as its default, and make the behaviour depend on a setting most people
 * have never seen.
 */

export const APP_LOCALES = ["en", "zh-CN"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

export const LOCALE_COOKIE = "interface-locale";

/** A year: the choice is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" && APP_LOCALES.includes(value as AppLocale)
  );
}

/**
 * The language to render in.
 *
 * Anything unrecognised is ignored rather than trusted: a cookie is client
 * data, and a profile row can hold whatever an older release wrote.
 */
export function resolveLocale({
  profileLocale,
  cookieLocale,
}: {
  profileLocale?: string | null;
  cookieLocale?: string | null;
}): AppLocale {
  if (isAppLocale(profileLocale)) return profileLocale;
  if (isAppLocale(cookieLocale)) return cookieLocale;
  return DEFAULT_LOCALE;
}

/** What goes in the document's `lang`. */
export const HTML_LANG: Record<AppLocale, string> = {
  en: "en",
  "zh-CN": "zh-CN",
};

/** How each language names itself — never translated. */
export const LOCALE_LABEL: Record<AppLocale, string> = {
  en: "English",
  "zh-CN": "中文",
};
