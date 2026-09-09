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
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const password = "CareerMint123!";
const jdText =
  "Lead product discovery for a European marketplace team. Measure customer outcomes with SQL and dashboards. German C1 is required.";

/** Strings that mean "we have nothing here" and were rendered as if they did. */
const placeholders = ["未填写", "未说明", "暂无", "尚未设置", "N/A"];

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`copy-e2e-${name.toLowerCase()}-missing`);
  return value;
}

function clients() {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  return {
    admin: createClient(supabaseUrl, requiredEnv("SUPABASE_SECRET_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    account: createClient(
      supabaseUrl,
      requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } },
    ),
  };
}

async function createUser(admin: AdminClient) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `copy-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "文案检查" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("copy-e2e-user-not-created");
  }
  return { email, userId: created.data.user.id };
}

async function prepareAccount(page: Page, account: SupabaseClient, email: string) {
  const signedIn = await account.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/onboarding|\/app/u);
  await page.goto("/app");
  if (/\/onboarding/u.test(page.url())) {
    await page.getByLabel("姓名").fill("文案检查");
    await page.getByLabel("目标岗位").fill("Product Manager");
    await page.getByRole("button", { name: "保存求职目标" }).click();
    await page.getByRole("button", { name: "暂时跳过" }).click();
    await page.getByRole("button", { name: "进入工作台" }).click();
    await page.waitForURL(/\/app/u);
  }
}

test("never renders a placeholder where a value belongs", async ({ page }) => {
  test.setTimeout(180_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await prepareAccount(page, account, email);

    // An application with every optional field left out — the case that
    // produces a placeholder if anything does.
    await page.goto("/applications/new");
    await page.getByLabel("公司").fill("Northstar GmbH");
    await page.getByLabel("职位").fill("Product Analyst");
    await page.getByLabel("JD 原文").fill(jdText);
    await page.getByRole("button", { name: "建立申请工作区" }).click();
    await page.waitForURL(/\/applications\/[0-9a-f-]+\?tab=resume/u);
    const id = new URL(page.url()).pathname.split("/").pop();

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
      }, placeholders);

      for (const hit of found) {
        failures.push(`${route}  “${hit.text}”  ${hit.where}`);
      }
    }

    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
