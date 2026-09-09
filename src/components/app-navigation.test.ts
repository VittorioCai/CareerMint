import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

import { appNavigation } from "./app-navigation";

describe("appNavigation", () => {
  it("keeps the approved four-item information architecture", () => {
    // Routes are the contract; the words are not. Labels moved to the
    // dictionaries so there is one place per language rather than one place
    // per language per component.
    expect(appNavigation.map((item) => item.href)).toEqual([
      "/app",
      "/applications",
      "/profile",
      "/interview",
    ]);
  });

  it("names every destination in both languages", () => {
    // The type already guarantees the key exists. What it cannot guarantee is
    // that somebody left the string empty.
    for (const item of appNavigation) {
      expect(en.shell.nav[item.key]).toBeTruthy();
      expect(zhCN.shell.nav[item.key]).toBeTruthy();
    }
  });
});
