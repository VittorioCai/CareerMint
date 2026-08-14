import { describe, expect, it } from "vitest";

import { careerFactDataSchema, transitionFactStatus } from "./schemas";

describe("career fact rules", () => {
  it("accepts a work fact without inventing an end date", () => {
    expect(
      careerFactDataSchema.parse({
        title: "Product Analyst",
        organization: "Example Ltd",
        startDate: "2024-01",
        endDate: null,
        description: "Built weekly product reports.",
        skills: ["SQL"],
      }),
    ).toMatchObject({ endDate: null });
  });

  it("requires explicit user confirmation", () => {
    expect(transitionFactStatus("pending", "confirmed", false)).toEqual({
      ok: false,
      reason: "explicit-confirmation-required",
    });
    expect(transitionFactStatus("pending", "confirmed", true)).toEqual({
      ok: true,
    });
  });
});
