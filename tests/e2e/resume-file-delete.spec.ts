import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const password = "CareerMint123!";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`resume-file-delete-e2e-${name.toLowerCase()}-missing`);
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
  const email = `resume-file-delete-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Delete File Test" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("resume-file-delete-e2e-user-not-created");
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
  // Before the browser loads anything: the profile outranks the cookie, so a
  // spec asserting Chinese copy has to set it ahead of the first render rather
  // than after onboarding. Goes away per spec as its surfaces are translated.
  const localed = await account
    .from("profiles")
    .update({ interface_locale: "zh-CN" })
    .eq("user_id", signedIn.data.user.id);
  if (localed.error) throw localed.error;
  await login(page, email);
  if (/\/onboarding/u.test(page.url())) {
    await page.getByLabel("姓名").fill("Delete File Test");
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

async function createApplication(page: Page) {
  await page.goto("/applications/new");
  await page.getByLabel("公司").fill("Northstar GmbH");
  await page.getByLabel("职位").fill("Product Analyst");
  await page.getByLabel("JD 原文").fill(
    "Analyze product performance, report findings, and support business decisions.",
  );
  await page.getByRole("button", { name: "建立申请工作区" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+\?tab=resume&setup=1$/u);
  const applicationId = new URL(page.url()).pathname.split("/").pop();
  if (!applicationId) throw new Error("resume-file-delete-e2e-application-id-missing");
  return applicationId;
}

test("deletes an uploaded resume without taking the work built on it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);
  try {
    await prepareAccount(page, account, email, userId);
    const applicationId = await createApplication(page);

    await page
      .getByLabel("上传新的 PDF 或 DOCX 简历")
      .setInputFiles("tests/fixtures/resume-en.pdf");
    await page.getByRole("button", { name: "上传并使用这份简历" }).click();
    await expect(page).toHaveURL(
      /\/applications\/[0-9a-f-]+\?tab=difference&setup=1$/u,
    );

    const asset = await account
      .from("source_assets")
      .select("id, storage_path")
      .eq("user_id", userId)
      .single();
    if (asset.error) throw asset.error;

    // The picker collapses once a baseline is chosen, so deleting the file in
    // use goes through the same path as swapping it.
    await page.goto(`/applications/${applicationId}?tab=resume`);
    await page.getByRole("button", { name: "更换简历" }).click();

    await page
      .getByRole("button", { name: "删除 resume-en.pdf", exact: true })
      .click();
    const warning = page.locator('[role="alert"]').filter({
      hasText: "确定删除 resume-en.pdf？",
    });
    await expect(warning).toContainText("这份简历是 1 份投递的对照简历");
    await expect(warning).toContainText("原文件不能恢复，需要时请重新上传。");

    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(warning).toHaveCount(0);

    await page
      .getByRole("button", { name: "删除 resume-en.pdf", exact: true })
      .click();
    await page.getByRole("button", { name: "确认删除文件", exact: true }).click();

    await expect(page.getByRole("status")).toContainText(
      "已删除 resume-en.pdf。",
    );
    await expect(
      page.getByRole("button", { name: "删除 resume-en.pdf", exact: true }),
    ).toHaveCount(0);

    const remainingRows = await account
      .from("source_assets")
      .select("id", { count: "exact", head: true })
      .eq("id", asset.data.id);
    if (remainingRows.error) throw remainingRows.error;
    expect(remainingRows.count).toBe(0);

    const storedFile = await admin.storage
      .from("resume-sources")
      .download(asset.data.storage_path);
    expect(storedFile.error).not.toBeNull();

    // The application falls back to having no baseline rather than breaking.
    await page.goto(`/applications/${applicationId}?tab=resume`);
    await expect(
      page.getByText("对照简历确定后，系统才能判断它与岗位要求之间的差异。"),
    ).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
