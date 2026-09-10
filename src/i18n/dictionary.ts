import { en, type Dictionary } from "./dictionaries/en";
import { zhCN } from "./dictionaries/zh-CN";
import type { AppLocale } from "./locale";

const dictionaries: Record<AppLocale, Dictionary> = {
  en,
  "zh-CN": zhCN,
};

/**
 * The dictionary for one language.
 *
 * Deliberately not in `@/i18n/server`: that module is `server-only` because
 * it reads cookies, and importing it made a pure transformation module —
 * `provider-output`, whose only need is a few sentences in the run's language
 * — unimportable in a plain test. Resolving a language nobody has to look up
 * is a lookup, not a request.
 */
export function dictionaryFor(locale: AppLocale): Dictionary {
  return dictionaries[locale];
}
