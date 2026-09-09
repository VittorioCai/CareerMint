import { describe, expect, it } from "vitest";

import { isAppLocale, resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("gives a new visitor English", () => {
    expect(resolveLocale({})).toBe("en");
  });

  it("remembers a signed-out visitor's choice", () => {
    expect(resolveLocale({ cookieLocale: "zh-CN" })).toBe("zh-CN");
  });

  it("lets the account outrank the device", () => {
    // The profile is the only thing that follows a user between devices, so a
    // cookie left on a shared laptop must not override what they chose.
    expect(
      resolveLocale({ profileLocale: "zh-CN", cookieLocale: "en" }),
    ).toBe("zh-CN");
    expect(
      resolveLocale({ profileLocale: "en", cookieLocale: "zh-CN" }),
    ).toBe("en");
  });

  it("ignores anything it did not write", () => {
    // A cookie is client data and a profile row can hold whatever an older
    // release put there. Neither is trusted enough to render from.
    expect(resolveLocale({ cookieLocale: "de" })).toBe("en");
    expect(resolveLocale({ cookieLocale: "<script>" })).toBe("en");
    expect(resolveLocale({ profileLocale: "zh-TW", cookieLocale: "zh-CN" })).toBe(
      "zh-CN",
    );
    expect(resolveLocale({ profileLocale: null, cookieLocale: null })).toBe("en");
  });

  it("does not treat an empty string as a choice", () => {
    expect(resolveLocale({ profileLocale: "", cookieLocale: "" })).toBe("en");
  });
});

describe("isAppLocale", () => {
  it("accepts only the two the product ships", () => {
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("zh-CN")).toBe(true);
    expect(isAppLocale("zh")).toBe(false);
    expect(isAppLocale("EN")).toBe(false);
    expect(isAppLocale(undefined)).toBe(false);
    expect(isAppLocale(null)).toBe(false);
    expect(isAppLocale(0)).toBe(false);
  });
});
