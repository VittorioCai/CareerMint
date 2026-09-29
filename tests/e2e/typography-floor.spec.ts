/**
 * Line length, measured rather than intended.
 *
 * A `max-w-2xl` on a paragraph is a guess about what that comes to in
 * characters, and the guess is different for each of this product's two
 * languages. So the check measures the rendered box in `em`: a CJK glyph is
 * exactly 1em wide, so 40em is 40 Chinese characters, and the same 40em is
 * roughly 72 Latin ones. One number satisfies both.
 *
 * Only real prose is measured. A chip, a button label and a table cell are not
 * paragraphs, and constraining them would be a different (wrong) rule.
 */
import { expect, test } from "@playwright/test";

import {
  FLOOR_LOCALES,
  clients,
  createApplication,
  createUser,
  prepareAccount,
} from "./support/floor-account";

const jdText =
  "Lead product discovery for a European marketplace team. Measure customer outcomes with SQL and dashboards. Work with business stakeholders across three markets. German C1 is required.";

/** The measure the type system promises, plus a pixel of rounding slack. */
const maxEm = 46;
/** Below this a run of text is a label, not prose, whatever element holds it. */
const proseChars = 40;

// Once per language. The measure is in em so that one number holds for both,
// but only a measurement in both can say that it does: an English sentence
// is one and a half to three times the length of its Chinese counterpart.
for (const locale of FLOOR_LOCALES) {
test(`keeps every line of prose inside its measure (${locale})`, async ({ page }) => {
  test.setTimeout(180_000);
  // The widest realistic desktop: a measure that holds at 1440 holds below it.
  await page.setViewportSize({ width: 1680, height: 1000 });
  const { admin, account } = clients("typography");
  const { email, userId } = await createUser(admin, "typography");

  try {
    await prepareAccount(page, account, email, locale);
    const id = await createApplication(page, locale, jdText);

    const routes = [
      "/",
      "/login",
      "/app",
      "/applications",
      "/profile",
      "/interview",
      "/settings/account",
      "/settings/privacy",
      `/applications/${id}?tab=overview`,
      `/applications/${id}?tab=difference`,
      "/dev/states",
    ];

    const failures: string[] = [];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      const wide = await page.evaluate(
        ({ maxEm, proseChars }) => {
          const results: { em: number; text: string; selector: string }[] = [];
          for (const element of document.querySelectorAll("p, li, dd, blockquote")) {
            if (!element.checkVisibility()) continue;
            // Only the element's own text: a <p> wrapping a chip is a layout
            // box, and its children are measured on their own turn.
            const own = [...element.childNodes]
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent ?? "")
              .join("")
              .trim();
            if (own.length < proseChars) continue;

            const style = getComputedStyle(element);
            const size = Number.parseFloat(style.fontSize);
            if (!size) continue;
            const em = element.getBoundingClientRect().width / size;
            if (em <= maxEm) continue;

            const tag = element.tagName.toLowerCase();
            const cls = element.getAttribute("class")?.slice(0, 60) ?? "";
            results.push({
              em: Math.round(em),
              text: own.slice(0, 30),
              selector: `${tag}.${cls}`,
            });
          }
          return results;
        },
        { maxEm, proseChars },
      );

      for (const item of wide) {
        failures.push(
          `${route}  ${item.em}em > ${maxEm}  “${item.text}…”  ${item.selector}`,
        );
      }
    }

    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
}
