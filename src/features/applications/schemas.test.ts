import { describe, expect, it } from "vitest";

import {
  APPLICATION_STAGE_LABELS,
  applicationFilterSchema,
  canChangeApplicationStage,
  newApplicationSchema,
  stageChangeSchema,
} from "./schemas";

const completeJd =
  "Lead product discovery, partner with engineering, and measure customer outcomes.";

describe("application schemas", () => {
  it("normalizes a manually entered application", () => {
    expect(
      newApplicationSchema.parse({
        companyName: "  Acme GmbH  ",
        roleTitle: " Product Manager ",
        location: " ",
        workplaceMode: "hybrid",
        source: "  Company site ",
        jobUrl: "",
        jdText: `  ${completeJd}  `,
      }),
    ).toEqual({
      companyName: "Acme GmbH",
      roleTitle: "Product Manager",
      location: null,
      workplaceMode: "hybrid",
      source: "Company site",
      jobUrl: null,
      jdText: completeJd,
    });
  });

  it("rejects non-http job links and short JDs", () => {
    expect(() =>
      newApplicationSchema.parse({
        companyName: "Acme",
        roleTitle: "PM",
        location: "Berlin",
        workplaceMode: "onsite",
        source: "Referral",
        jobUrl: "javascript:alert(1)",
        jdText: "Too short",
      }),
    ).toThrow();
  });

  it("rejects unchanged stages before a repository call", () => {
    expect(canChangeApplicationStage("preparing", "preparing")).toEqual({
      ok: false,
      reason: "application-stage-unchanged",
    });
    expect(canChangeApplicationStage("rejected", "interview")).toEqual({
      ok: true,
    });
  });

  it("turns an occurrence date into a stable UTC timestamp", () => {
    expect(
      stageChangeSchema.parse({
        applicationId: "11111111-1111-4111-8111-111111111111",
        stage: "applied",
        occurredOn: "2026-08-13",
        note: "  Applied on the company site. ",
      }),
    ).toEqual({
      applicationId: "11111111-1111-4111-8111-111111111111",
      stage: "applied",
      occurredAt: "2026-08-13T12:00:00.000Z",
      note: "Applied on the company site.",
    });
  });

  it("rejects a future occurrence date", () => {
    expect(() =>
      stageChangeSchema.parse({
        applicationId: "11111111-1111-4111-8111-111111111111",
        stage: "interview",
        occurredOn: "2999-01-01",
        note: "",
      }),
    ).toThrow();
  });

  it("parses stable list filters and keeps text labels for every stage", () => {
    expect(
      applicationFilterSchema.parse({ view: "table", q: "  acme ", stage: "hr" }),
    ).toEqual({ view: "table", q: "acme", stage: "hr" });

    expect(Object.values(APPLICATION_STAGE_LABELS)).toEqual([
      "准备中",
      "已投递",
      "HR 沟通",
      "面试",
      "Offer",
      "已拒绝",
      "已撤回",
    ]);
  });
});
