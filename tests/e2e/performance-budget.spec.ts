/**
 * A performance budget that can fail a build.
 *
 * Two things are measured and two are deliberately not.
 *
 * **Measured: layout shift.** CLS is a property of the layout, not of the
 * machine, so it reads the same on a laptop and on a shared CI runner. The
 * budget is zero, which is achievable and which this app currently meets.
 *
 * **Measured: bytes.** A transfer size does not vary with load. It is also the
 * number that actually regresses — one stray top-level import of a charting
 * library, and every route carries it forever without anything else changing.
 *
 * **Not measured: LCP and TBT.** They are timings, and a CI runner shares its
 * CPU with whatever else the provider scheduled. A 2.0s LCP budget there fails
 * on a noisy neighbour and passes on a quiet one, which teaches everyone to
 * re-run it. Run those locally against this same server with Lighthouse or
 * DevTools, throttled to 4× CPU and Fast 3G; this spec keeps the ratchet on
 * the parts a machine can be held to.
 *
 * Runs against a production build (`pnpm test:e2e:perf`), because a dev server
 * ships unminified, uncompressed bundles and a byte budget against it would be
 * measuring the wrong thing.
 *
 * **Why the signed-in routes are here too.** For a while they were not, and
 * that hole is exactly how `/interview` came to transfer 929 KB against every
 * other page's 620 without anyone noticing: a client component imported a
 * four-string tuple as a value from a module that imports zod, and 287 KB of
 * validator went with it. `client-bundle.test.ts` now catches that specific
 * mistake; this catches the general one, on the pages the product actually
 * lives on.
 */
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

/** Reachable without an account, which is where a first visit lands. */
const signedOutRoutes = ["/", "/login", "/forgot-password"];

/**
 * Where the product is actually used. Deliberately the empty-account shape of
 * each: this measures the code a route ships, not how much data a busy account
 * has, and an account with fifty applications would make the number drift for
 * a reason that has nothing to do with the bundle.
 */
const signedInRoutes = [
  "/app",
  "/applications",
  "/profile",
  "/interview",
  "/settings/account",
];

/**
 * Compressed bytes for a cold first visit.
 *
 * Measured here today: the signed-out routes sit at 604-612 KB and the
 * signed-in ones at 543-555 — framework chunks, fonts, CSS and nothing
 * unexpected. The budget sits above all of them with room for ordinary growth.
 *
 * It is a ratchet against a dependency arriving unnoticed, not a target:
 * raising it should be a deliberate line in a diff with a reason next to it.
 * Verified by reinstating the zod import this caught: /interview goes to
 * 852 KB and the failure names it against its siblings.
 */
const transferBudgetKB = 700;
const password = "CareerMint123!";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`perf-budget-${name.toLowerCase()}-missing`);
  return value;
}

/**
 * An account that is past onboarding and otherwise empty.
 *
 * Created through the admin API rather than walked through the sign-up and
 * onboarding forms: this spec is about bytes, and every click spent setting up
 * an account is a click that can flake for a reason the budget does not care
 * about.
 *
 * The profile row is written by the account's own client, not the admin one.
 * `service_role` has no grant on `public.profiles`, so the admin key gets
 * 42501 there; the owner writes it under RLS instead.
 */
async function emptyAccount() {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const admin = createClient(supabaseUrl, requiredEnv("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `perf-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Perf Budget" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("perf-budget-user-not-created");
  }
  const userId = created.data.user.id;

  const account = createClient(
    supabaseUrl,
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const signedIn = await account.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const onboarded = await account
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (onboarded.error) throw onboarded.error;

  return { admin, email, userId };
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app|\/onboarding/u, { timeout: 60_000 });
}

/** Both numbers for one route: what it transferred, and how much it shifted. */
async function measure(page: Page, route: string) {
  const transferred = new Map<string, number>();
  const record = (response: {
    url(): string;
    headers(): Record<string, string>;
    body(): Promise<Buffer>;
  }) => {
    const url = response.url();
    void response
      .body()
      .then((body) => {
        // Content-Length is what the browser was told; a body length is what
        // it actually decoded. Header first, body as the fallback.
        const declared = Number(response.headers()["content-length"]);
        transferred.set(
          url,
          Number.isFinite(declared) && declared > 0 ? declared : body.byteLength,
        );
      })
      .catch(() => undefined);
  };
  page.on("response", record);

  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (shift.hadRecentInput) continue;
        (window as unknown as { __cls: number }).__cls += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto(route, { waitUntil: "load" });
  // Fonts and any late chunk have landed by here; a shift after this is a
  // shift the reader would have seen.
  await page.waitForTimeout(2_000);

  const cls = await page.evaluate(
    () => (window as unknown as { __cls: number }).__cls,
  );
  const totalKB =
    [...transferred.values()].reduce((sum, size) => sum + size, 0) / 1024;
  page.off("response", record);
  return { cls, totalKB: Math.round(totalKB) };
}

function assertWithinBudget(
  route: string,
  { cls, totalKB }: { cls: number; totalKB: number },
) {
  expect(cls, `${route} shifted its layout`).toBeLessThanOrEqual(0.001);
  expect(
    totalKB,
    `${route} transferred ${totalKB} KB`,
  ).toBeLessThanOrEqual(transferBudgetKB);
}

test.describe("performance budget", () => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL,
    "needs a production server: run `pnpm test:e2e:perf`",
  );

  for (const route of signedOutRoutes) {
    test(`${route} does not shift and stays inside its byte budget`, async ({
      page,
    }) => {
      assertWithinBudget(route, await measure(page, route));
    });
  }

  // One account and one sign-in for all five routes: signing in five times
  // would spend a minute proving something this spec is not measuring.
  test("the signed-in routes stay inside their byte budget", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { admin, email, userId } = await emptyAccount();

    try {
      await signIn(page, email);
      const measured: Record<string, { cls: number; totalKB: number }> = {};
      for (const route of signedInRoutes) {
        measured[route] = await measure(page, route);
      }

      // Reported together, so a failure shows which route is the outlier
      // rather than only that one of them is over.
      const report = Object.entries(measured)
        .map(([route, { totalKB, cls }]) => `${route} ${totalKB} KB cls=${cls}`)
        .join("\n");
      for (const [route, result] of Object.entries(measured)) {
        expect(
          result.totalKB,
          `${route} transferred ${result.totalKB} KB\n${report}`,
        ).toBeLessThanOrEqual(transferBudgetKB);
        expect(result.cls, `${route} shifted its layout\n${report}`)
          .toBeLessThanOrEqual(0.001);
      }
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  });
});
