/**
 * Runs the performance budget against a production build.
 *
 * The rest of the e2e suite runs against `next dev`, which is right for
 * behaviour and wrong for bytes: it ships unminified, uncompressed modules, so
 * a transfer budget measured there would be measuring the dev server. This
 * builds, serves the result on its own port, points Playwright at it through
 * PLAYWRIGHT_BASE_URL, and tears the server down whatever happens.
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = Number(process.env.PERF_PORT ?? 3210);
const base = `http://127.0.0.1:${PORT}`;

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
    env: { ...process.env, PLAYWRIGHT_BASE_URL: base },
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
