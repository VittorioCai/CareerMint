import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./server";

describe("parseServerEnv", () => {
  it("rejects missing private credentials", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
      }),
    ).toThrow("SUPABASE_SECRET_KEY");
  });

  it("defaults the isolated text provider to DeepSeek V4 Flash", () => {
    expect(
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
        SUPABASE_SECRET_KEY: "secret-key",
      }),
    ).toMatchObject({
      AI_TEXT_PROVIDER: "deepseek",
      AI_TEXT_MODEL: "deepseek-v4-flash",
    });
  });
});
