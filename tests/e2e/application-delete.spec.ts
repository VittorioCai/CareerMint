import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const password = "CareerMint123!";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`application-delete-e2e-${name.toLowerCase()}-missing`);
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
  await expect(page).toHaveURL(/\/onboarding|\/app/);
}

async function createUser(admin: AdminClient) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `application-delete-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Delete Test" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("application-delete-e2e-user-not-created");
  }
  return { email, userId: created.data.user.id };
}

async function prepareAccount(
  page: Page,
  account: SupabaseClient,
  email: string,
  userId: string,
) {
  const signedIn = await account.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  await login(page, email);
  if (/\/onboarding/.test(page.url())) {
    await page.getByLabel("姓名").fill("Delete Test");
    await page.getByLabel("目标岗位").fill("Product Manager");
    await page.getByRole("button", { name: "保存求职目标" }).click();
    await page.getByRole("button", { name: "暂时跳过" }).click();
    await page.getByRole("button", { name: "进入工作台" }).click();
  }
  const updated = await account
    .from("profiles")
    .update({ ai_processing_consent_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (updated.error) throw updated.error;
}

test("deletes an owned application only after the second explicit action", async ({ page }) => {
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);
  try {
    await prepareAccount(page, account, email, userId);
    await page.goto("/applications/new");
    await page.getByLabel("公司").fill("Delete Me GmbH");
    await page.getByLabel("职位").fill("Product Analyst");
    await page.getByLabel("JD 原文").fill(
      "Analyze product performance, report findings, and support decisions.",
    );
    await page.getByRole("button", { name: "建立申请工作区" }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+\?tab=resume&setup=1$/);
    const applicationId = new URL(page.url()).pathname.split("/").pop();
    if (!applicationId) throw new Error("application-delete-e2e-id-missing");

    await page.goto(`/applications/${applicationId}`);
    await page.getByRole("button", { name: "删除记录", exact: true }).click();
    const deleteWarning = page
      .locator('[role="alert"]')
      .filter({ hasText: "Delete Me GmbH · Product Analyst" });
    await expect(deleteWarning).toContainText(
      "Delete Me GmbH · Product Analyst",
    );
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(deleteWarning).toHaveCount(0);

    await page.getByRole("button", { name: "删除记录", exact: true }).click();
    await page.getByRole("button", { name: "确认删除记录", exact: true }).click();
    await expect(page).toHaveURL(/\/applications$/);

    const deleted = await account
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("id", applicationId);
    if (deleted.error) throw deleted.error;
    expect(deleted.count).toBe(0);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
