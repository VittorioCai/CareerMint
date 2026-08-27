import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://127.0.0.1:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  AI_TEXT_PROVIDER: z.literal("deepseek").default("deepseek"),
  AI_TEXT_MODEL: z.string().min(1).default("deepseek-v4-flash"),
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
