/**
 * The phone, checked on a phone.
 *
 * Three failures this catches, all of which look fine at 1440px:
 *
 *   - chrome eating the first screen. The navigation used to be six pills that
 *     wrapped onto two rows, so 340px of a 844px phone was spent before the
 *     page's own heading;
 *   - targets too small to hit. 44px is Apple's number and it is not a
 *     rounding of 40 — a control below it is one a thumb misses;
 *   - horizontal overflow, which on a phone is not a scrollbar but a page that
 *     slides sideways under the finger and never quite comes back.
 */
import { expect, test, type Page } from "@playwright/test";

import { dictionaryFor } from "@/i18n/dictionary";
import type { AppLocale } from "@/i18n/locale";

import {
  FLOOR_LOCALES,
  clients,
  createApplication,
  createUser,
  prepareAccount,
} from "./support/floor-account";

const phone = { width: 390, height: 844 };
const jdText =
  "Lead product discovery for a European marketplace team. Measure customer outcomes with SQL and dashboards. German C1 is required.";

async function routesFor(page: Page, locale: AppLocale) {
  const id = await createApplication(page, locale, jdText, {
    location: "Berlin, DE",
  });
  return [
    "/app",
    "/applications",
    "/profile",
    "/interview",
    "/settings/account",
    `/applications/${id}?tab=overview`,
    `/applications/${id}?tab=difference`,
  ];
}

// Every check below runs once per language. A label that fits its button in
// two Chinese characters is a different width in English, and width is what
// all three of these measure.
for (const locale of FLOOR_LOCALES) {

test(`gives the phone its screen back (${locale})`, async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(phone);
  const { admin, account } = clients("mobile");
  const { email, userId } = await createUser(admin, "mobile");

  try {
    await prepareAccount(page, account, email, locale);
    const routes = await routesFor(page, locale);
    const failures: string[] = [];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      const report = await page.evaluate(() => {
        const main = document.querySelector("main");
        const heading = document.querySelector("main h1");
        return {
          // A page that slides sideways under the thumb.
          overflow:
            document.documentElement.scrollWidth - window.innerWidth > 1
              ? document.documentElement.scrollWidth - window.innerWidth
              : 0,
          // How much of the first screen the app spends on itself before the
          // page says what it is.
          chrome: main ? Math.round(main.getBoundingClientRect().top) : -1,
          headingTop: heading
            ? Math.round(heading.getBoundingClientRect().top)
            : -1,
        };
      });

      if (report.overflow) {
        failures.push(`${route}  overflows by ${report.overflow}px`);
      }
      // One header row, not two rows of wrapped navigation.
      if (report.chrome > 88) {
        failures.push(`${route}  ${report.chrome}px of chrome above <main>`);
      }
      if (report.headingTop > 200) {
        failures.push(
          `${route}  the page's own heading starts at ${report.headingTop}px`,
        );
      }
    }

    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});

test(`shows exactly one primary navigation at every breakpoint (${locale})`, async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { admin, account } = clients("mobile");
  const { email, userId } = await createUser(admin, "mobile");

  try {
    await page.setViewportSize(phone);
    await prepareAccount(page, account, email, locale);
    const failures: string[] = [];

    // 768 is the switch itself: the sidebar appears and the tab bar goes, and
    // an off-by-one there shows both at once or neither.
    for (const width of [390, 767, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/app", "/applications", "/profile"]) {
        await page.goto(route);
        await page.waitForLoadState("domcontentloaded");
        const seen = await page.evaluate((label) => {
          const navs = [...document.querySelectorAll("nav")].filter(
            (nav) => nav.getAttribute("aria-label") === label,
          );
          return {
            visible: navs.filter((nav) => nav.checkVisibility()).length,
            overflow: Math.max(
              0,
              document.documentElement.scrollWidth - window.innerWidth,
            ),
          };
        }, dictionaryFor(locale).shell.primaryNavigation);
        if (seen.visible !== 1) {
          failures.push(`${width}px ${route}  ${seen.visible} primary navs`);
        }
        if (seen.overflow > 1) {
          failures.push(`${width}px ${route}  overflows by ${seen.overflow}px`);
        }
      }
    }

    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});

test(`gives every control something a thumb can hit (${locale})`, async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(phone);
  const { admin, account } = clients("mobile");
  const { email, userId } = await createUser(admin, "mobile");

  try {
    await prepareAccount(page, account, email, locale);
    const routes = await routesFor(page, locale);
    const failures: string[] = [];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      const small = await page.evaluate(() => {
        const results: { name: string; w: number; h: number }[] = [];
        const controls = document.querySelectorAll(
          "a, button, summary, input:not([type=hidden]), select, textarea, [role=button]",
        );
        for (const control of controls) {
          if (!control.checkVisibility()) continue;
          // WCAG 2.2's inline exception: a link inside a sentence cannot be
          // 44px tall without breaking the sentence, and the surrounding text
          // gives the thumb its context.
          const style = getComputedStyle(control);
          if (style.display === "inline") continue;
          // A checkbox is 16px by design in every OS, and a file input is
          // routinely shrunk to a pixel and driven by its label. What the
          // thumb aims at is that label, wrapping or `for=`, so that is what
          // gets measured.
          const labels: Element[] = [];
          const wrapping = control.closest("label");
          if (wrapping) labels.push(wrapping);
          if (control.id) {
            labels.push(
              ...document.querySelectorAll(
                `label[for="${CSS.escape(control.id)}"]`,
              ),
            );
          }
          // A hidden file input often has two labels: the field's caption and
          // the styled control that opens the picker. Either one activates it,
          // so the control is reachable if *any* of them is thumb-sized — and
          // the caption is usually the wider of the two, so "largest" is the
          // wrong question.
          const boxes = [control, ...labels].map((node) =>
            node.getBoundingClientRect(),
          );
          if (boxes.some((b) => b.width >= 44 && b.height >= 44)) continue;
          const box = boxes.reduce((best, next) =>
            next.height > best.height ? next : best,
          );
          results.push({
            name: `<${control.tagName.toLowerCase()}> ${
              control.getAttribute("aria-label") ??
              control.textContent?.trim().slice(0, 24) ??
              ""
            }`,
            w: Math.round(box.width),
            h: Math.round(box.height),
          });
        }
        return results;
      });

      // A redirect measures a page nobody asked about, and its failures look
      // like the requested route's.
      const landed = new URL(page.url()).pathname;
      for (const control of small) {
        failures.push(
          `${route}${landed === route.split("?")[0] ? "" : ` (→ ${landed})`}  ${control.w}×${control.h} < 44  ${control.name}`,
        );
      }
    }

    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
}
