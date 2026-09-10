import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * The six tabs of an application, in order.
 *
 * Ids, not labels — the id is in the URL and shared links carry it, so it
 * cannot change with the language. The words come from the dictionary.
 */
export const applicationDetailTabs = [
  "overview",
  "resume",
  "difference",
  "improvements",
  "interview",
  "timeline",
] as const satisfies readonly (keyof Dictionary["detail"]["tabs"])[];

export type ApplicationDetailTab = (typeof applicationDetailTabs)[number];

export function resolveApplicationDetailTab(
  value: string | undefined,
): ApplicationDetailTab {
  if (value === "jd") return "difference";
  return applicationDetailTabs.some((tab) => tab === value)
    ? (value as ApplicationDetailTab)
    : "overview";
}
