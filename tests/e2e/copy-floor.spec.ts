/**
 * Copy rules that can be checked by a machine.
 *
 * Two of them, both from the product's own constraint that nothing on screen
 * is there for free:
 *
 *   1. A placeholder is not content. 未填写 / 未说明 / 暂无 / 尚未设置 in a
 *      rendered value means the app had nothing to say and said it anyway,
 *      taking up a row that could have been absent. A `<select>` option
 *      offering 未说明 as a choice is a different thing and is exempt.
 *   2. An error tells the reader what to do next. "分析没有完成，请重新尝试。"
 *      says only that it failed; every entry in an error-copy table has to
 *      name an action.
 *
 * The rest of the copy work — tone, whether an empty state points forward,
 * punctuation in mixed Chinese and Latin — is a person's job, and the plan
 * says so.
 */
import { expect, test } from "@playwright/test";

import type { AppLocale } from "@/i18n/locale";

import {
  FLOOR_LOCALES,
  clients,
  createApplication,
  createUser,
  prepareAccount,
} from "./support/floor-account";

const jdText =
  "Lead product discovery for a European marketplace team. Measure customer outcomes with SQL and dashboards. German C1 is required.";

/**
 * Strings that mean "we have nothing here" and were rendered as if they did,
 * in each language the interface speaks. The English ones are what the
 * dictionary calls the same absences, plus the phrasings a developer reaches
 * for without looking.
 */
const placeholders: Record<AppLocale, string[]> = {
  "zh-CN": ["未填写", "未说明", "暂无", "尚未设置", "N/A"],
  en: ["Not filled in", "Not specified", "None yet", "Not set", "N/A"],
};

for (const locale of FLOOR_LOCALES) {
test(`never renders a placeholder where a value belongs (${locale})`, async ({ page }) => {
  test.setTimeout(180_000);
  const { admin, account } = clients("copy");
  const { email, userId } = await createUser(admin, "copy");

  try {
    await prepareAccount(page, account, email, locale);

    // An application with every optional field left out — the case that
    // produces a placeholder if anything does.
    const id = await createApplication(page, locale, jdText);

    const routes = [
      "/app",
      "/applications",
      "/applications?view=board",
      "/profile",
      "/interview",
      "/settings/account",
      `/applications/${id}?tab=overview`,
      `/applications/${id}?tab=difference`,
      // The fixture page renders the missing-field and empty variants that a
      // one-minute-old account never reaches.
      "/dev/states",
    ];

    const failures: string[] = [];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      const found = await page.evaluate((needles) => {
        const hits: { text: string; where: string }[] = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        let node = walker.nextNode();
        while (node) {
          const text = node.textContent?.trim() ?? "";
          const parent = node.parentElement;
          node = walker.nextNode();
          if (!text || !parent) continue;
          // Offering 未说明 as a choice is a value the user picks, not a gap
          // the app is papering over.
          if (parent.closest("option, select, datalist")) continue;
          if (!parent.checkVisibility()) continue;
          const hit = needles.find((needle) => text.includes(needle));
          if (!hit) continue;
          hits.push({
            text: text.slice(0, 40),
            where: `<${parent.tagName.toLowerCase()}> ${
              parent.getAttribute("class")?.slice(0, 40) ?? ""
            }`,
          });
        }
        return hits;
      }, placeholders[locale]);

      for (const hit of found) {
        failures.push(`${route}  “${hit.text}”  ${hit.where}`);
      }
    }

    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
}
