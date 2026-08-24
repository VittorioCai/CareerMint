import { describe, expect, it } from "vitest";

import type { Application, ApplicationStage } from "./schemas";
import { summarizeApplications } from "./summary";

function application(
  id: string,
  stage: ApplicationStage,
  updatedAt: string,
): Application {
  return {
    id,
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companyName: `Company ${id}`,
    roleTitle: "Product Manager",
    location: null,
    workplaceMode: "unspecified",
    source: null,
    jobUrl: null,
    jdText:
      "Lead product discovery, partner with engineering, and measure customer outcomes.",
    stage,
    stageChangedAt: updatedAt,
    appliedAt: stage === "preparing" ? null : updatedAt,
    nextAction: null,
    nextActionDueAt: null,
    resumeSourceAssetId: null,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("summarizeApplications", () => {
  it("counts current stages without claiming causality", () => {
    const result = summarizeApplications([
      application("1", "preparing", "2026-08-10T10:00:00Z"),
      application("2", "applied", "2026-08-11T10:00:00Z"),
      application("3", "hr", "2026-08-12T10:00:00Z"),
      application("4", "interview", "2026-08-13T10:00:00Z"),
      application("5", "offer", "2026-08-14T10:00:00Z"),
      application("6", "rejected", "2026-08-09T10:00:00Z"),
      application("7", "withdrawn", "2026-08-08T10:00:00Z"),
    ]);

    expect(result).toMatchObject({
      total: 7,
      active: 5,
      submitted: 6,
      interviews: 1,
      offers: 1,
    });
    expect(result.recent.map((item) => item.id)).toEqual(["5", "4", "3", "2", "1"]);
  });

  it("returns zero-safe metrics for a new account", () => {
    expect(summarizeApplications([])).toEqual({
      total: 0,
      active: 0,
      submitted: 0,
      interviews: 0,
      offers: 0,
      recent: [],
    });
  });
});
