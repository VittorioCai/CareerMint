import type { Dictionary } from "@/i18n/dictionaries/en";

export function dashboardJDActionLabel(
  applicationCount: number,
  copy: Dictionary["applications"],
) {
  return applicationCount === 0 ? copy.addFirstJd : copy.addJd;
}
