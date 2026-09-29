import { z } from "zod";

import type { AIUsage } from "@/features/extraction/provider";

const ratesSchema = z.object({
  inputCacheHitPerMillion: z.number().nonnegative(),
  inputCacheMissPerMillion: z.number().nonnegative(),
  outputPerMillion: z.number().nonnegative(),
});

const windowSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export const priceScheduleSchema = z.object({
  version: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  currency: z.literal("USD"),
  observedAt: z.string().datetime(),
  sourceUrl: z.url(),
  effectiveFrom: z.string().datetime(),
  effectiveUntil: z.string().datetime().nullable(),
  defaultRates: ratesSchema,
  peak: z
    .object({
      windowsUtc: z.array(windowSchema),
      rates: ratesSchema,
    })
    .nullable(),
});

export type AIPriceSchedule = z.infer<typeof priceScheduleSchema>;

type Window = z.infer<typeof windowSchema>;

function minutes(value: string) {
  const [hours, minute] = value.split(":").map(Number);
  return hours * 60 + minute;
}

function windowSegments(window: Window): Array<[number, number]> {
  const start = minutes(window.start);
  const end = minutes(window.end);
  if (start === end) throw new Error("invalid-peak-window");
  return start < end ? [[start, end]] : [[start, 1440], [0, end]];
}

function assertNonOverlappingWindows(windows: Window[]) {
  const segments = windows.flatMap(windowSegments).sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index][0] < segments[index - 1][1]) {
      throw new Error("overlapping-peak-windows");
    }
  }
}

export function parsePriceSchedule(raw: string): AIPriceSchedule {
  const schedule = priceScheduleSchema.parse(JSON.parse(raw));
  if (schedule.peak) {
    assertNonOverlappingWindows(schedule.peak.windowsUtc);
  }
  return schedule;
}

/**
 * The schedule, if it prices the model that actually answered.
 *
 * A mismatch used to be silent: the schedule was dropped and the run's cost
 * recorded as null, so a typo in `AI_PRICE_SCHEDULE_JSON` or `AI_TEXT_MODEL`
 * looked exactly like a run that cost nothing. The run still succeeds — a
 * pricing mistake is no reason to fail the user's analysis — but it now says
 * so where someone reading the logs will see it. Identifiers only; no usage
 * and no content.
 */
export function priceScheduleFor(
  schedule: AIPriceSchedule | undefined,
  answered: { provider: string; model: string },
): AIPriceSchedule | undefined {
  if (!schedule) return undefined;
  if (
    schedule.provider === answered.provider &&
    schedule.model === answered.model
  ) {
    return schedule;
  }
  console.error("ai-price-schedule-model-mismatch", {
    scheduleVersion: schedule.version,
    scheduleProvider: schedule.provider,
    scheduleModel: schedule.model,
    answeredProvider: answered.provider,
    answeredModel: answered.model,
  });
  return undefined;
}

function isInsideWindow(atMinutes: number, window: Window) {
  const start = minutes(window.start);
  const end = minutes(window.end);
  return start < end
    ? atMinutes >= start && atMinutes < end
    : atMinutes >= start || atMinutes < end;
}

export function estimateAITextCost(
  usage: AIUsage,
  schedule: AIPriceSchedule,
  at: Date,
): {
  amount: number;
  currency: "USD";
  scheduleVersion: string;
  tier: "default" | "peak";
} | null {
  const timestamp = at.getTime();
  const effectiveFrom = new Date(schedule.effectiveFrom).getTime();
  const effectiveUntil = schedule.effectiveUntil
    ? new Date(schedule.effectiveUntil).getTime()
    : null;

  if (
    !Number.isFinite(timestamp) ||
    timestamp < effectiveFrom ||
    (effectiveUntil !== null && timestamp >= effectiveUntil)
  ) {
    return null;
  }

  const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  const peak =
    schedule.peak?.windowsUtc.some((window) =>
      isInsideWindow(utcMinutes, window),
    ) ?? false;
  const rates = peak && schedule.peak
    ? schedule.peak.rates
    : schedule.defaultRates;
  const amount =
    (usage.inputCacheHitTokens * rates.inputCacheHitPerMillion +
      usage.inputCacheMissTokens * rates.inputCacheMissPerMillion +
      usage.outputTokens * rates.outputPerMillion) /
    1_000_000;

  return {
    amount,
    currency: "USD",
    scheduleVersion: schedule.version,
    tier: peak ? "peak" : "default",
  };
}
