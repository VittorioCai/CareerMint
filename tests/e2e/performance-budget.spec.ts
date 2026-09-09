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
 */
import { expect, test } from "@playwright/test";

/** Routes reachable without an account, which is where a first visit lands. */
const routes = ["/", "/login", "/forgot-password"];

/**
 * Compressed bytes for a cold first visit. Today's worst route is 647 KB —
 * 379 of framework chunks, 77 of fonts, 55 of CSS, and nothing unexpected — so
 * the budget sits just above it. It is a ratchet against a new dependency
 * arriving unnoticed, not a target: raising it should be a deliberate line in
 * a diff with a reason next to it.
 */
const transferBudgetKB = 700;

test.describe("performance budget", () => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL,
    "needs a production server: run `pnpm test:e2e:perf`",
  );

  for (const route of routes) {
    test(`${route} does not shift and stays inside its byte budget`, async ({
      page,
    }) => {
      const transferred = new Map<string, number>();
      page.on("response", (response) => {
        const url = response.url();
        void response
          .body()
          .then((body) => {
            // Content-Length is what the browser was told; a body length is
            // what it actually decoded. Header first, body as the fallback.
            const declared = Number(response.headers()["content-length"]);
            transferred.set(
              url,
              Number.isFinite(declared) && declared > 0
                ? declared
                : body.byteLength,
            );
          })
          .catch(() => undefined);
      });

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
      expect(cls, `${route} shifted its layout`).toBeLessThanOrEqual(0.001);

      const totalKB =
        [...transferred.values()].reduce((sum, size) => sum + size, 0) / 1024;
      expect(
        Math.round(totalKB),
        `${route} transferred ${Math.round(totalKB)} KB`,
      ).toBeLessThanOrEqual(transferBudgetKB);
    });
  }
});
