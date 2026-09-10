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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const phone = { width: 390, height: 844 };
const password = "CareerMint123!";
const jdText =
  "Lead product discovery for a European marketplace team. Measure customer outcomes with SQL and dashboards. German C1 is required.";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`mobile-e2e-${name.toLowerCase()}-missing`);
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

async function login(page: Page, email: string) {
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
  await expect(page).toHaveURL(/\/onboarding|\/app/u);
}

async function createUser(admin: AdminClient) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `mobile-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Mobile" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("mobile-e2e-user-not-created");
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
  await login(page, email);
  // Signing in lands on /app, which then redirects to /onboarding for a new
  // account. Reading the URL straight after the click can catch the /app leg
  // of that, skip the onboarding steps, and leave every later route silently
  // measuring the onboarding page. A goto resolves redirects before returning.
  await page.goto("/app");
  if (/\/onboarding/u.test(page.url())) {
    await page.getByLabel("姓名").fill("移动端检查");
    await page.getByLabel("目标岗位").fill("Product Manager");
    await page.getByRole("button", { name: "保存求职目标" }).click();
    await page.getByRole("button", { name: "暂时跳过" }).click();
    await page.getByRole("button", { name: "进入工作台" }).click();
    // Without this the next goto races the redirect and lands back on
    // /onboarding, which silently measures the wrong page.
    await page.waitForURL(/\/app/u);
  }
}

async function routesFor(page: Page) {
  await page.goto("/applications/new");
  await page.getByLabel("公司").fill("Northstar GmbH");
  await page.getByLabel("职位").fill("Product Analyst");
  await page.getByLabel("地点").fill("Berlin, DE");
  await page.getByLabel("JD 原文").fill(jdText);
  await page.getByRole("button", { name: "建立申请工作区" }).click();
  await page.waitForURL(/\/applications\/[0-9a-f-]+\?tab=resume/u);
  const id = new URL(page.url()).pathname.split("/").pop();
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

test("gives the phone its screen back", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(phone);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await prepareAccount(page, account, email);
    const routes = await routesFor(page);
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

test("shows exactly one primary navigation at every breakpoint", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await page.setViewportSize(phone);
    await prepareAccount(page, account, email);
    const failures: string[] = [];

    // 768 is the switch itself: the sidebar appears and the tab bar goes, and
    // an off-by-one there shows both at once or neither.
    for (const width of [390, 767, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/app", "/applications", "/profile"]) {
        await page.goto(route);
        await page.waitForLoadState("domcontentloaded");
        const seen = await page.evaluate(() => {
          const navs = [...document.querySelectorAll("nav[aria-label='主导航']")];
          return {
            visible: navs.filter((nav) => nav.checkVisibility()).length,
            overflow: Math.max(
              0,
              document.documentElement.scrollWidth - window.innerWidth,
            ),
          };
        });
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

test("gives every control something a thumb can hit", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(phone);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await prepareAccount(page, account, email);
    const routes = await routesFor(page);
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
