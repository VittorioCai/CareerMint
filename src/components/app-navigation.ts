import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * The four destinations. Labels live in the dictionary rather than here, so
 * this stays a list of routes and the words stay in one place per language.
 */
export const appNavigation = [
  { href: "/app", key: "home" },
  { href: "/applications", key: "applications" },
  { href: "/profile", key: "profile" },
  { href: "/interview", key: "interview" },
] as const satisfies readonly {
  href: string;
  key: keyof Dictionary["shell"]["nav"];
}[];
