/**
 * Choosing a language before you have an account.
 *
 * English is the default for anyone new, which leaves a Chinese speaker
 * reading an English page to complete a sign-in whose only purpose is to
 * reach the setting that would have made the page readable. So the switch
 * lives on the signed-out pages too, and this proves it works there: no
 * account, no profile row, nothing but a cookie.
 */
import { expect, test } from "@playwright/test";

import { en } from "@/i18n/dictionaries/en";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

test("lets a visitor change language before signing in", async ({ page }) => {
  await page.goto("/login");

  // English is what a browser with no history gets.
  await expect(
    page.getByRole("heading", { name: en.auth.pages.signInTitle }),
  ).toBeVisible();

  await page
    .getByRole("group", { name: en.common.language })
    .getByRole("button", { name: "中文" })
    .click();

  await expect(
    page.getByRole("heading", { name: zhCN.auth.pages.signInTitle }),
  ).toBeVisible();
  await expect(page.getByLabel(zhCN.auth.email)).toBeVisible();
});

test("carries the choice across the signed-out pages and a reload", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("group", { name: en.common.language })
    .getByRole("button", { name: "中文" })
    .click();
  await expect(
    page.getByRole("link", { name: zhCN.landing.signIn }),
  ).toBeVisible();

  // A preference, not a page state: it survives navigating to a different
  // signed-out route and reloading it.
  await page.goto("/forgot-password");
  await expect(
    page.getByRole("heading", { name: zhCN.auth.pages.forgotTitle }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: zhCN.auth.pages.forgotTitle }),
  ).toBeVisible();

  // And the document says which language it is in, so a screen reader picks
  // the right voice.
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});
