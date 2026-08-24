import { describe, expect, it } from "vitest";

import { applicationDetailTabs } from "./detail-tabs";

describe("application detail tabs", () => {
  it("places resume before JD analysis", () => {
    expect(applicationDetailTabs.map((tab) => tab.label)).toEqual([
      "概览",
      "简历",
      "JD",
      "面试准备",
      "时间线",
    ]);
  });
});
