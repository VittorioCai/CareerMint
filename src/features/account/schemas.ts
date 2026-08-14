import { z } from "zod";

function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const accountPreferencesSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  interfaceLocale: z.enum(["zh-CN", "en"]),
  timezone: z.string().trim().min(1).max(100).refine(isIanaTimezone, {
    message: "invalid-timezone",
  }),
  targetRole: z.string().trim().min(1).max(160),
  targetCountries: z
    .array(z.string().trim().min(1).max(100))
    .max(20)
    .transform((countries) => [...new Set(countries)]),
  jobSearchLanguage: z.literal("en"),
  aiProcessingAllowed: z.boolean(),
});

export type AccountPreferences = z.infer<typeof accountPreferencesSchema>;
