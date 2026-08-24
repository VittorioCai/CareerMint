import { describe, expect, it, vi } from "vitest";

import {
  isLocalPlaywrightRun,
  loadLocalSupabaseEnv,
  parseSupabaseStatusEnv,
} from "./local-supabase-env";

const statusOutput = `
Already up to date
Done in 173ms using pnpm v11.19.0
Stopped services: [supabase_imgproxy_career-profile-foundation]
API_URL="http://127.0.0.1:54321"
PUBLISHABLE_KEY="local-publishable-key"
SECRET_KEY="local-secret-key"
`;

describe("parseSupabaseStatusEnv", () => {
  it("ignores pnpm and Supabase status lines while parsing quoted values", () => {
    expect(parseSupabaseStatusEnv(statusOutput)).toEqual({
      API_URL: "http://127.0.0.1:54321",
      PUBLISHABLE_KEY: "local-publishable-key",
      SECRET_KEY: "local-secret-key",
    });
  });

  it("reports the required status key without echoing secret output", () => {
    expect(() =>
      parseSupabaseStatusEnv(
        'API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY="public"',
      ),
    ).toThrow("SECRET_KEY");
    expect(() =>
      parseSupabaseStatusEnv(
        'API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY="public"',
      ),
    ).not.toThrow("local-secret");
  });
});

describe("loadLocalSupabaseEnv", () => {
  it("identifies local runs separately from remote Playwright targets", () => {
    expect(isLocalPlaywrightRun({})).toBe(true);
    expect(isLocalPlaywrightRun({ PLAYWRIGHT_BASE_URL: "https://preview.example.test" })).toBe(false);
  });

  it("uses local Supabase values only for a local Playwright server and preserves explicit env", () => {
    const readStatus = vi.fn(() => statusOutput);
    const env: Record<string, string | undefined> = {
      NEXT_PUBLIC_SUPABASE_URL: "http://explicit.example.test",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "explicit-public",
    };

    loadLocalSupabaseEnv(env, readStatus);

    expect(readStatus).toHaveBeenCalledOnce();
    expect(env).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: "http://explicit.example.test",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "explicit-public",
      SUPABASE_SECRET_KEY: "local-secret-key",
    });
  });

  it("does not invoke the local status command for a remote Playwright target", () => {
    const readStatus = vi.fn(() => statusOutput);
    const env: Record<string, string | undefined> = {
      PLAYWRIGHT_BASE_URL: "https://preview.example.test",
      NEXT_PUBLIC_SUPABASE_URL: "https://preview.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "preview-public",
      SUPABASE_SECRET_KEY: "preview-secret",
    };

    loadLocalSupabaseEnv(env, readStatus);

    expect(readStatus).not.toHaveBeenCalled();
    expect(env).toEqual({
      PLAYWRIGHT_BASE_URL: "https://preview.example.test",
      NEXT_PUBLIC_SUPABASE_URL: "https://preview.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "preview-public",
      SUPABASE_SECRET_KEY: "preview-secret",
    });
  });

  it("keeps an explicitly supplied secret even when the local status has another value", () => {
    const env: Record<string, string | undefined> = {
      SUPABASE_SECRET_KEY: "explicit-secret",
    };

    loadLocalSupabaseEnv(env, () => statusOutput);

    expect(env.SUPABASE_SECRET_KEY).toBe("explicit-secret");
  });
});
