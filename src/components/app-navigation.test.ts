import { describe, expect, it } from "vitest";

import { appNavigation } from "./app-navigation";

describe("appNavigation", () => {
  it("keeps the approved four-item information architecture", () => {
    expect(appNavigation).toEqual([
      { href: "/app", label: "首页" },
      { href: "/applications", label: "我的投递" },
      { href: "/profile", label: "职业档案" },
      { href: "/interview", label: "面试题库" },
    ]);
  });
});
