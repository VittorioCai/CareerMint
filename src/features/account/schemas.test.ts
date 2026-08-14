import { describe, expect, it } from "vitest";

import { accountPreferencesSchema } from "./schemas";

const valid = {
  displayName: "  Lin Chen  ",
  interfaceLocale: "zh-CN",
  timezone: "Europe/Berlin",
  targetRole: "  Product Analyst  ",
  targetCountries: ["Germany", "Netherlands"],
  jobSearchLanguage: "en",
  aiProcessingAllowed: false,
};

describe("accountPreferencesSchema", () => {
  it("trims names and roles and accepts zero or more countries", () => {
    expect(accountPreferencesSchema.parse(valid)).toMatchObject({
      displayName: "Lin Chen",
      targetRole: "Product Analyst",
      targetCountries: ["Germany", "Netherlands"],
    });
    expect(
      accountPreferencesSchema.parse({ ...valid, targetCountries: [] })
        .targetCountries,
    ).toEqual([]);
  });

  it("requires a valid IANA timezone", () => {
    expect(() =>
      accountPreferencesSchema.parse({ ...valid, timezone: "Mars/Olympus" }),
    ).toThrow();
  });

  it("allows only the release locales and English job-search language", () => {
    expect(() =>
      accountPreferencesSchema.parse({ ...valid, interfaceLocale: "de" }),
    ).toThrow();
    expect(() =>
      accountPreferencesSchema.parse({ ...valid, jobSearchLanguage: "zh" }),
    ).toThrow();
    expect(accountPreferencesSchema.parse({ ...valid, interfaceLocale: "en" }))
      .toBeTruthy();
  });

  it("requires explicit AI processing consent", () => {
    const missingConsent = { ...valid } as Partial<typeof valid>;
    delete missingConsent.aiProcessingAllowed;
    expect(() => accountPreferencesSchema.parse(missingConsent)).toThrow();
  });
});
