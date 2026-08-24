import { describe, expect, it } from "vitest";

import { dashboardJDActionLabel } from "./dashboard-copy";

describe("dashboardJDActionLabel", () => {
  it("uses first-use copy only when there are no applications", () => {
    expect(dashboardJDActionLabel(0)).toBe("添加第一份 JD");
    expect(dashboardJDActionLabel(1)).toBe("添加 JD");
    expect(dashboardJDActionLabel(12)).toBe("添加 JD");
  });
});
