import { describe, expect, it } from "vitest";

import { estimateAITextCost, parsePriceSchedule } from "./pricing";

const validSchedule = {
  version: "synthetic-v1",
  provider: "example-provider",
  model: "example-model",
  currency: "USD",
  observedAt: "2026-08-01T00:00:00.000Z",
  sourceUrl: "https://example.com/official-pricing",
  effectiveFrom: "2026-08-02T00:00:00.000Z",
  effectiveUntil: "2026-09-01T00:00:00.000Z",
  defaultRates: {
    inputCacheHitPerMillion: 0.1,
    inputCacheMissPerMillion: 0.2,
    outputPerMillion: 0.3,
  },
  peak: {
    windowsUtc: [{ start: "16:00", end: "20:00" }],
    rates: {
      inputCacheHitPerMillion: 1,
      inputCacheMissPerMillion: 2,
      outputPerMillion: 3,
    },
  },
};

describe("AI price schedules", () => {
  it("requires an observation date and official source URL", () => {
    const withoutObservedAt: Partial<typeof validSchedule> = {
      ...validSchedule,
    };
    delete withoutObservedAt.observedAt;
    expect(() => parsePriceSchedule(JSON.stringify(withoutObservedAt))).toThrow();

    const withoutSourceUrl: Partial<typeof validSchedule> = {
      ...validSchedule,
    };
    delete withoutSourceUrl.sourceUrl;
    expect(() => parsePriceSchedule(JSON.stringify(withoutSourceUrl))).toThrow();
  });

  it("selects a peak UTC window using synthetic rates", () => {
    const schedule = parsePriceSchedule(JSON.stringify(validSchedule));

    expect(
      estimateAITextCost(
        {
          inputCacheHitTokens: 1_000_000,
          inputCacheMissTokens: 1_000_000,
          outputTokens: 1_000_000,
        },
        schedule,
        new Date("2026-08-10T17:30:00.000Z"),
      ),
    ).toEqual({
      amount: 6,
      currency: "USD",
      scheduleVersion: "synthetic-v1",
      tier: "peak",
    });
  });

  it("returns null once a schedule has expired", () => {
    const schedule = parsePriceSchedule(JSON.stringify(validSchedule));

    expect(
      estimateAITextCost(
        {
          inputCacheHitTokens: 100,
          inputCacheMissTokens: 100,
          outputTokens: 100,
        },
        schedule,
        new Date("2026-09-01T00:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("rejects overlapping peak windows", () => {
    expect(() =>
      parsePriceSchedule(
        JSON.stringify({
          ...validSchedule,
          peak: {
            ...validSchedule.peak,
            windowsUtc: [
              { start: "16:00", end: "20:00" },
              { start: "19:30", end: "21:00" },
            ],
          },
        }),
      ),
    ).toThrow("overlapping-peak-windows");
  });
});
