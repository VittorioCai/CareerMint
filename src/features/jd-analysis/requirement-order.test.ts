import { describe, expect, it } from "vitest";

import { orderRequirements } from "./requirement-order";

describe("requirement ordering", () => {
  it("puts uncovered requirements first, then core priority, while keeping stable source order", () => {
    const rows = [
      { id: "evidence", matchStatus: "evidence" as const, priority: "core" as const, sortOrder: 0 },
      { id: "partial-support", matchStatus: "partial" as const, priority: "supporting" as const, sortOrder: 1 },
      { id: "none-support", matchStatus: "none" as const, priority: "supporting" as const, sortOrder: 2 },
      { id: "needs-core", matchStatus: "needs_user" as const, priority: "core" as const, sortOrder: 3 },
      { id: "none-core-first", matchStatus: "none" as const, priority: "core" as const, sortOrder: 4 },
      { id: "none-core-second", matchStatus: "none" as const, priority: "core" as const, sortOrder: 5 },
    ];

    expect(orderRequirements(rows).map((row) => row.id)).toEqual([
      "none-core-first",
      "none-core-second",
      "none-support",
      "needs-core",
      "partial-support",
      "evidence",
    ]);
    expect(rows.map((row) => row.id)).toEqual([
      "evidence",
      "partial-support",
      "none-support",
      "needs-core",
      "none-core-first",
      "none-core-second",
    ]);
  });
});
