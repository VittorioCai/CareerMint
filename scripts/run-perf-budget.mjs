/**
 * Runs the performance budget against a production build.
 *
 * The rest of the e2e suite runs against `next dev`, which is right for
 * behaviour and wrong for bytes: it ships unminified, uncompressed modules, so
 * a transfer budget measured there would be measuring the dev server. This
 * builds, serves the result on its own port, points Playwright at it through
 * PLAYWRIGHT_BASE_URL, and tears the server down whatever happens.
 */
import { execFileSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = Number(process.env.PERF_PORT ?? 3210);
const base = `http://127.0.0.1:${PORT}`;

/**
 * The local Supabase credentials, injected here rather than by the Playwright
 * config.
 *
 * `loadLocalSupabaseEnv` deliberately does nothing when `PLAYWRIGHT_BASE_URL`
 * is set, because that normally means the suite is pointed at somebody else's
 * server and local keys have no business being sent there. This script is the
 * exception it does not know about: the base URL is a production build of this
 * repository, served on a port of its own, against the same local Supabase.
 *
 * The signed-in half of the budget needs an account, so it needs those keys.
 */
function localSupabaseEnv() {
  const output = execFileSync(
    "pnpm",
    ["exec", "supabase", "status", "-o", "env"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const wanted = {
    API_URL: "NEXT_PUBLIC_SUPABASE_URL",
    PUBLISHABLE_KEY: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    SECRET_KEY: "SUPABASE_SECRET_KEY",
  };
  const env = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const target = wanted[match[1]];
    if (!target) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (value) env[target] = value;
  }
  const missing = Object.values(wanted).filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `perf-budget: local Supabase is not running (missing ${missing.join(", ")})`,
    );
  }
  return env;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/login`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await delay(1_000);
  }
  throw new Error(`perf-budget: ${base} never came up`);
}

await run("npx", ["next", "build"]);

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  stdio: "ignore",
  detached: true,
});

let failure;
try {
  await waitForServer();
  await run("npx", ["playwright", "test", "performance-budget"], {
    env: { ...process.env, ...localSupabaseEnv(), PLAYWRIGHT_BASE_URL: base },
  });
} catch (error) {
  failure = error;
} finally {
  // Detached so the whole group goes, including anything next start forked.
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

if (failure) {
  console.error(String(failure.message ?? failure));
  process.exit(1);
}
