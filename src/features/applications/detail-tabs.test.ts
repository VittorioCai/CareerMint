import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

import {
  applicationDetailTabs,
  resolveApplicationDetailTab,
} from "./detail-tabs";

describe("application detail workflow tabs", () => {
  it("uses the approved soft workflow in the exact order", () => {
    // Ids, not labels: the id is in the URL and shared links carry it, so it
    // cannot change with the language.
    expect(applicationDetailTabs).toEqual([
      "overview",
      "resume",
      "difference",
      "improvements",
      "interview",
      "timeline",
    ]);

    // Each one is named in both languages. The type guarantees the key exists;
    // it cannot guarantee somebody left the string empty.
    for (const dictionary of [en, zhCN]) {
      for (const tab of applicationDetailTabs) {
        expect(dictionary.detail.tabs[tab]).toBeTruthy();
      }
    }
  });

  it("keeps saved JD links compatible with the difference tab", () => {
    expect(resolveApplicationDetailTab("jd")).toBe("difference");
    expect(resolveApplicationDetailTab("difference")).toBe("difference");
    expect(resolveApplicationDetailTab("unknown")).toBe("overview");
    expect(resolveApplicationDetailTab(undefined)).toBe("overview");
  });

  it("disconnects the application page from the old V3 interface", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(app)/applications/[id]/page.tsx"),
      "utf8",
    );
    for (const oldDependency of [
      "JDGapAnalysisControl",
      "JDGapAnalysisPanel",
      "jdGapV3Repository",
      "jdStructureRepository",
    ]) {
      expect(page).not.toContain(oldDependency);
    }
    // The V4 feature owns this tab's copy now — the page only wires it up, so
    // the check is on the wiring rather than on strings that moved.
    expect(page).toContain("ResumeJDDifferencePanel");
    expect(page).toContain("ResumeJDDifferenceAnalysisControl");
  });
});
