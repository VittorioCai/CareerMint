import { execFileSync } from "node:child_process";

const statusKeys = ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"] as const;
type StatusKey = (typeof statusKeys)[number];
type LocalSupabaseEnv = Record<StatusKey, string>;

const targetEnvKeys: Record<StatusKey, keyof NodeJS.ProcessEnv> = {
  API_URL: "NEXT_PUBLIC_SUPABASE_URL",
  PUBLISHABLE_KEY: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  SECRET_KEY: "SUPABASE_SECRET_KEY",
};

function unquote(value: string) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed
      .slice(1, -1)
      .replace(/\\([\\"'])/g, "$1");
  }
  return trimmed;
}

export function parseSupabaseStatusEnv(output: string): LocalSupabaseEnv {
  const parsed: Partial<LocalSupabaseEnv> = {};

  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1] as StatusKey;
    if (!statusKeys.includes(key)) continue;

    const value = unquote(match[2]);
    if (value) parsed[key] = value;
  }

  const missing = statusKeys.filter((key) => !parsed[key]);
  if (missing.length > 0) {
    throw new Error(`local-supabase-status-missing-${missing.join("-")}`);
  }

  return parsed as LocalSupabaseEnv;
}

function readLocalSupabaseStatus() {
  try {
    return execFileSync(
      "pnpm",
      ["exec", "supabase", "status", "-o", "env"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    throw new Error(
      "local-supabase-status-unavailable: start local Supabase before running E2E",
    );
  }
}

export function loadLocalSupabaseEnv(
  targetEnv: Record<string, string | undefined>,
  readStatus: () => string = readLocalSupabaseStatus,
) {
  if (targetEnv.PLAYWRIGHT_BASE_URL) return;

  const localEnv = parseSupabaseStatusEnv(readStatus());
  for (const key of statusKeys) {
    const targetKey = targetEnvKeys[key];
    if (!targetEnv[targetKey]) targetEnv[targetKey] = localEnv[key];
  }
}
