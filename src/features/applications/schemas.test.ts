import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

import {
  APPLICATION_STAGES,
  applicationFilterSchema,
  applicationResumeSourceSchema,
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

  it("normalizes an empty baseline resume selection to null", () => {
    expect(
      applicationResumeSourceSchema.parse({
        applicationId: "11111111-1111-4111-8111-111111111111",
        sourceAssetId: "",
      }),
    ).toEqual({
      applicationId: "11111111-1111-4111-8111-111111111111",
      sourceAssetId: null,
    });

    expect(
      applicationResumeSourceSchema.parse({
        applicationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({
      applicationId: "11111111-1111-4111-8111-111111111111",
      sourceAssetId: null,
    });
  });

  it("accepts a baseline resume source asset id", () => {
    expect(
      applicationResumeSourceSchema.parse({
        applicationId: "11111111-1111-4111-8111-111111111111",
        sourceAssetId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({
      applicationId: "11111111-1111-4111-8111-111111111111",
      sourceAssetId: "22222222-2222-4222-8222-222222222222",
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

    // Labels moved to the dictionaries; what this file still owns is that the
    // stage enum and the labels cannot drift apart, in either language.
    for (const dictionary of [en, zhCN]) {
      expect(Object.keys(dictionary.applications.stages)).toEqual([
        ...APPLICATION_STAGES,
      ]);
      for (const stage of APPLICATION_STAGES) {
        expect(dictionary.applications.stages[stage]).toBeTruthy();
      }
    }
  });
});
