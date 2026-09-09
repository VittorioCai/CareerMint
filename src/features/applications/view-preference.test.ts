import { describe, expect, it } from "vitest";

import { resolveApplicationView } from "./schemas";

describe("resolveApplicationView", () => {
  it("falls back to the table, which survives having one record", () => {
    expect(resolveApplicationView(undefined, undefined)).toBe("table");
  });

  it("remembers the last choice so it is not made twice", () => {
    expect(resolveApplicationView(undefined, "board")).toBe("board");
  });

  it("lets an explicit link win over what this browser remembers", () => {
    // A colleague's link to the board must show the board, and a link to the
    // table must show the table, whichever way this browser last looked.
    expect(resolveApplicationView("table", "board")).toBe("table");
    expect(resolveApplicationView("board", "table")).toBe("board");
  });

  it("ignores anything it did not write", () => {
    expect(resolveApplicationView("kanban", undefined)).toBe("table");
    expect(resolveApplicationView(undefined, "'; drop table")).toBe("table");
    expect(resolveApplicationView("kanban", "board")).toBe("board");
  });
});
