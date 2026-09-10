import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

import { dashboardJDActionLabel } from "./dashboard-copy";

describe("dashboardJDActionLabel", () => {
  it("uses first-use copy only when there are no applications", () => {
    expect(dashboardJDActionLabel(0, zhCN.applications)).toBe(
      zhCN.applications.addFirstJd,
    );
    expect(dashboardJDActionLabel(1, zhCN.applications)).toBe(
      zhCN.applications.addJd,
    );
    expect(dashboardJDActionLabel(12, zhCN.applications)).toBe(
      zhCN.applications.addJd,
    );
  });

  it("says it in whichever language it is handed", () => {
    expect(dashboardJDActionLabel(0, en.applications)).toBe(
      en.applications.addFirstJd,
    );
    // Otherwise the assertions above would pass in either language.
    expect(en.applications.addFirstJd).not.toBe(zhCN.applications.addFirstJd);
  });
});
