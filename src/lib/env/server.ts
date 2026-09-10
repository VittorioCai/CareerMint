import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://127.0.0.1:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  AI_TEXT_PROVIDER: z.literal("deepseek").default("deepseek"),
  /**
   * `deepseek-flash` is DeepSeek-V4.1-Flash's own identifier, per
   * https://api-docs.deepseek.com/quick_start/pricing.
   *
   * The previous default was `deepseek-v4-flash`, which the API still accepts
   * — it is a legacy alias that routes to V4.1-Flash and bills at Flash
   * prices. So this changes which string we send, not which model answers:
   * that had already moved under us. What it buys is a name that is true, and
   * independence from an alias the provider can retire.
   *
   * It does change the model recorded on every run, and the model is part of
   * `input_hash`, so every cached analysis goes stale once. Same price either
   * way.
   */
  AI_TEXT_MODEL: z.string().min(1).default("deepseek-flash"),
  JD_GAP_MATCH_PROMPT_VARIANT: z.enum(["p1", "p2", "p3"]).default("p2"),
  RESUME_JD_DIFFERENCE_PROMPT_VARIANT: z
    .enum(["p1", "p2", "p3"])
    .default("p1"),
  AI_PRICE_SCHEDULE_JSON: z.string().min(1).optional(),
  E2E_FAKE_EXTRACTOR: z.enum(["0", "1"]).default("0"),
});

export function parseServerEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
) {
  return serverEnvSchema.parse(input);
}

export function getServerEnv() {
  return parseServerEnv(process.env);
}
