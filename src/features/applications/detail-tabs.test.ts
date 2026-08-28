import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applicationDetailTabs,
  resolveApplicationDetailTab,
} from "./detail-tabs";

describe("application detail workflow tabs", () => {
  it("uses the approved soft workflow in the exact order", () => {
    expect(applicationDetailTabs).toEqual([
      { id: "overview", label: "概览" },
      { id: "resume", label: "简历" },
      { id: "difference", label: "差异分析" },
      { id: "improvements", label: "完善建议" },
      { id: "interview", label: "面试准备" },
      { id: "timeline", label: "时间线" },
    ]);
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
    expect(page).toContain("岗位与简历差异分析");
    expect(page).toContain(
      "找出这份简历尚未覆盖、表达不清或无法证明的岗位重点。",
    );
  });
});
