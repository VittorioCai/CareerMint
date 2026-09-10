// @vitest-environment node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { estimateAITextCost, parsePriceSchedule } from "./pricing";

/**
 * The example price schedule is valid, and keyed to the example model.
 *
 * Two variables that have to agree, with nothing reporting it when they do
 * not. Every service compares `priceSchedule.model` with the model the run
 * actually used and, when they differ, drops the schedule and records the cost
 * as `null` — see `safeAIMetadata` in `resume-jd-difference/service.ts` and the
 * same comparison in the extraction and interview-generation services.
 *
 * So a typo in either variable does not fail. It stops costing anything, and
 * the only symptom is `estimated_cost_usd` quietly going null on every run.
 * This test makes `.env.example` the worked example of the pair agreeing, so
 * anyone copying it starts from a schedule that actually applies.
 */

async function exampleEnv() {
  const raw = await readFile(join(process.cwd(), ".env.example"), "utf8");
  const values = new Map<string, string>();
  for (const line of raw.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line);
    if (match) values.set(match[1] as string, (match[2] as string).trim());
  }
  return values;
}

describe(".env.example price schedule", () => {
  it("parses, and prices the model the example configures", async () => {
    const env = await exampleEnv();
    const model = env.get("AI_TEXT_MODEL");
    const rawSchedule = env.get("AI_PRICE_SCHEDULE_JSON");

    expect(model, "AI_TEXT_MODEL missing from .env.example").toBeTruthy();
    expect(
      rawSchedule,
      "AI_PRICE_SCHEDULE_JSON missing from .env.example",
    ).toBeTruthy();

    const schedule = parsePriceSchedule(rawSchedule as string);

    expect(
      schedule.model,
      "the schedule prices a different model than AI_TEXT_MODEL, so every run's cost would be recorded as null",
    ).toBe(model);
    expect(schedule.provider).toBe(env.get("AI_TEXT_PROVIDER"));
  });

  it("charges more inside the provider's peak windows than outside them", async () => {
    // A schedule whose peak block is present but never selected would look
    // right and bill like off-peak all day, which is what the previous
    // production value did by carrying `peak: null`.
    const env = await exampleEnv();
    const schedule = parsePriceSchedule(env.get("AI_PRICE_SCHEDULE_JSON") as string);
    const usage = {
      inputCacheHitTokens: 1_000,
      inputCacheMissTokens: 1_000,
      outputTokens: 1_000,
    };
    const at = (iso: string) => estimateAITextCost(usage, schedule, new Date(iso));

    const offPeak = at("2026-09-10T12:00:00.000Z");
    const peak = at("2026-09-10T02:00:00.000Z");

    expect(offPeak?.tier).toBe("default");
    expect(peak?.tier).toBe("peak");
    expect(peak?.amount).toBeGreaterThan(offPeak?.amount ?? 0);
    // The boundary is exclusive at the end, per `isInsideWindow`.
    expect(at("2026-09-10T09:59:00.000Z")?.tier).toBe("peak");
    expect(at("2026-09-10T10:00:00.000Z")?.tier).toBe("default");
  });
});
