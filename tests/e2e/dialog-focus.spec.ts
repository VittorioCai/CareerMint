/**
 * Modal dialogs, checked where modality actually exists.
 *
 * Both dialogs in this app used to be `<div role="dialog" aria-modal="true">`.
 * The attribute told a screen reader the rest of the page was unreachable
 * while Tab walked straight out into it, Escape did nothing, and dismissing
 * left focus wherever it happened to land. jsdom cannot catch any of that — it
 * has no top layer — so the guarantee is only worth what a real browser says
 * about it.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const password = "CareerMint123!";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`dialog-focus-e2e-${name.toLowerCase()}-missing`);
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
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding|\/app/u);
}

async function createUser(admin: AdminClient) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `dialog-focus-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Dialog Focus" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("dialog-focus-e2e-user-not-created");
  }
  return { email, userId: created.data.user.id };
}

async function prepareAccount(
  page: Page,
  account: SupabaseClient,
  email: string,
) {
  const signedIn = await account.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  // The interface is mid-translation: the shell is localized and the feature
  // pages are not, so a spec asserting Chinese copy has to ask for the Chinese
  // interface. New accounts default to English now. As each surface is
  // translated its spec moves to English and this write goes with it. The
  // account client writes it, not the admin one — service_role has no grant on
  // public.profiles, and this is the user's own row.
  const localed = await account
    .from("profiles")
    .update({ interface_locale: "zh-CN" })
    .eq("user_id", signedIn.data.user.id);
  if (localed.error) throw localed.error;
  await login(page, email);
  if (/\/onboarding/u.test(page.url())) {
    await page.getByLabel("姓名").fill("Dialog Focus");
    await page.getByLabel("目标岗位").fill("Product Manager");
    await page.getByRole("button", { name: "保存求职目标" }).click();
    await page.getByRole("button", { name: "暂时跳过" }).click();
    await page.getByRole("button", { name: "进入工作台" }).click();
  }
}

/**
 * Whether the keyboard is still held by the open dialog, and what holds it.
 *
 * `<body>` counts as held. Chromium parks focus there for one press as the
 * modal's tab order wraps from its last control back to its first, so a cycle
 * of two controls reads input → 取消 → body → input. That is the wrap, not an
 * escape: what an escape looks like is a control on the page behind, and this
 * still catches every one of those.
 */
async function focusInsideDialog(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    const dialog = document.querySelector("dialog[open]");
    return {
      inside: Boolean(
        element === document.body ||
          (dialog && element && dialog.contains(element)),
      ),
      description: element
        ? `<${element.tagName.toLowerCase()}> ${
            element.getAttribute("aria-label") ??
            element.textContent?.trim().slice(0, 24) ??
            ""
          }`
        : "nothing",
    };
  });
}

test("keeps the keyboard inside an open dialog and hands it back on Escape", async ({
  page,
}) => {
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await prepareAccount(page, account, email);
    await page.goto("/settings/privacy");

    const trigger = page.getByRole("button", { name: "删除我的账户" });
    await trigger.focus();
    await trigger.press("Enter");

    const dialog = page.getByRole("dialog", { name: "确认删除账户" });
    await expect(dialog).toBeVisible();

    // Twice round the dialog's own controls. If the trap is missing, one of
    // these lands on the page behind — the export link, the nav, the browser
    // chrome — and the loop reports which.
    const escapes: string[] = [];
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Tab");
      const focused = await focusInsideDialog(page);
      if (!focused.inside) escapes.push(`step ${step + 1}: ${focused.description}`);
    }
    expect(escapes, `\n${escapes.join("\n")}\n`).toEqual([]);

    // Shift+Tab wraps the other way, and is a separate code path in every
    // hand-rolled trap ever written.
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Shift+Tab");
      const focused = await focusInsideDialog(page);
      if (!focused.inside) {
        escapes.push(`back step ${step + 1}: ${focused.description}`);
      }
    }
    expect(escapes, `\n${escapes.join("\n")}\n`).toEqual([]);

    // The page behind is inert, not merely covered: a click that lands on it
    // must do nothing at all.
    await page.getByRole("link", { name: "下载全部数据" }).click({
      force: true,
      noWaitAfter: true,
    });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Focus goes back where it came from. Landing on <body> means the next Tab
    // restarts at the top of the page, which is how a keyboard user loses
    // their place.
    await expect(trigger).toBeFocused();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});

test("does not let a half-typed confirmation survive a dismissal", async ({
  page,
}) => {
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await prepareAccount(page, account, email);
    await page.goto("/settings/privacy");

    await page.getByRole("button", { name: "删除我的账户" }).click();
    await page.getByLabel("确认文字").fill("DELETE");
    await expect(
      page.getByRole("button", { name: "永久删除账户" }),
    ).toBeEnabled();

    await page.getByRole("button", { name: "取消" }).click();
    await page.getByRole("button", { name: "删除我的账户" }).click();

    // Reopening must not present an armed delete button.
    await expect(page.getByLabel("确认文字")).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "永久删除账户" }),
    ).toBeDisabled();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
