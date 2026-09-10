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
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const password = "CareerMint123!";
const jdText =
  "Lead product discovery for a European marketplace team. Measure customer outcomes with SQL and dashboards. Work with business stakeholders across three markets. German C1 is required.";

/** The measure the type system promises, plus a pixel of rounding slack. */
const maxEm = 46;
/** Below this a run of text is a label, not prose, whatever element holds it. */
const proseChars = 40;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`typography-e2e-${name.toLowerCase()}-missing`);
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
  const email = `typography-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "排版检查" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("typography-e2e-user-not-created");
  }
  return { email, userId: created.data.user.id };
}

async function prepareAccount(page: Page, account: SupabaseClient, email: string) {
  const signedIn = await account.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  // Before the browser loads anything: the profile outranks the cookie, so a
  // spec asserting Chinese copy has to set it ahead of the first render rather
  // than after onboarding. Goes away per spec as its surfaces are translated.
  const localed = await account
    .from("profiles")
    .update({ interface_locale: "zh-CN" })
    .eq("user_id", signedIn.data.user.id);
  if (localed.error) throw localed.error;
  // A signed-out visitor now gets English, so the login page a spec asserting
  // Chinese copy has to walk is Chinese only if this browser says so. The
  // profile write after sign-in covers the pages behind it; this covers the
  // ones in front. Both disappear per spec as its surfaces are translated.
  await page.context().addCookies([
    {
      name: "interface-locale",
      value: "zh-CN",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/onboarding|\/app/u);
  // Resolve the redirect before reading the URL: signing in touches /app on
  // the way to /onboarding, and a read that catches the first leg skips setup.
  await page.goto("/app");
  if (/\/onboarding/u.test(page.url())) {
    await page.getByLabel("姓名").fill("排版检查");
    await page.getByLabel("目标岗位").fill("Product Manager");
    await page.getByRole("button", { name: "保存求职目标" }).click();
    await page.getByRole("button", { name: "暂时跳过" }).click();
    await page.getByRole("button", { name: "进入工作台" }).click();
    await page.waitForURL(/\/app/u);
  }
}

test("keeps every line of prose inside its measure", async ({ page }) => {
  test.setTimeout(180_000);
  // The widest realistic desktop: a measure that holds at 1440 holds below it.
  await page.setViewportSize({ width: 1680, height: 1000 });
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await prepareAccount(page, account, email);

    await page.goto("/applications/new");
    await page.getByLabel("公司").fill("Northstar GmbH");
    await page.getByLabel("职位").fill("Product Analyst");
    await page.getByLabel("JD 原文").fill(jdText);
    await page.getByRole("button", { name: "建立申请工作区" }).click();
    await page.waitForURL(/\/applications\/[0-9a-f-]+\?tab=resume/u);
    const id = new URL(page.url()).pathname.split("/").pop();

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
