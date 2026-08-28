import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const password = "CareerMint123!";
const jdText = [
  "We are hiring a Product Analyst.",
  "You will use SQL for funnel analysis and communicate findings to business stakeholders.",
  "Experience building dashboards and explaining measurable outcomes is required.",
].join(" ");

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`application-e2e-${name.toLowerCase()}-missing`);
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
  const email = `application-workspace-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Application Test" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("application-e2e-user-not-created");
  }
  return { email, userId: created.data.user.id };
}

async function prepareAccount(
  page: Page,
  account: AdminClient,
  email: string,
  userId: string,
) {
  const signedIn = await account.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;

  await login(page, email);
  if (/\/onboarding/u.test(page.url())) {
    await page.getByLabel("姓名").fill("Application Test");
    await page.getByLabel("目标岗位").fill("Product Analyst");
    await page.getByRole("button", { name: "保存求职目标" }).click();
    await page.getByRole("button", { name: "暂时跳过" }).click();
    await page.getByRole("button", { name: "进入工作台" }).click();
  }

  const consented = await account
    .from("profiles")
    .update({ ai_processing_consent_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (consented.error) throw consented.error;
}

async function createApplication(
  page: Page,
  companyName: string,
  roleTitle: string,
) {
  await page.goto("/applications/new");
  await page.getByLabel("公司").fill(companyName);
  await page.getByLabel("职位").fill(roleTitle);
  await page.getByLabel("地点").fill("Berlin, Germany");
  await page.getByLabel("办公方式").selectOption("hybrid");
  await page.getByLabel("来源").fill("Company site");
  await page
    .getByLabel("岗位链接")
    .fill("https://example.com/jobs/product-analyst");
  await page.getByLabel("JD 原文").fill(jdText);
  await expect(page.getByText("草稿已保存在当前浏览器")).toBeVisible();
  await page.getByRole("button", { name: "建立申请工作区" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+\?tab=resume&setup=1$/u);
  const applicationId = new URL(page.url()).pathname.split("/").pop();
  if (!applicationId) throw new Error("application-e2e-id-missing");
  return { applicationId, detailUrl: `/applications/${applicationId}` };
}

async function uploadBaseline(page: Page, applicationId: string) {
  await page
    .getByLabel("上传新的 PDF 或 DOCX 简历")
    .setInputFiles("tests/fixtures/resume-en.pdf");
  await page.getByRole("button", { name: "上传并使用这份简历" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/applications/${applicationId}\\?tab=difference&setup=1$`, "u"),
  );
}

test("keeps resume selection, preview, workflow navigation, and deletion coherent", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await prepareAccount(page, account, email, userId);
    const application = await createApplication(
      page,
      "Acme GmbH",
      "Product Analyst",
    );
    await uploadBaseline(page, application.applicationId);

    await expect(
      page.getByRole("heading", { name: "岗位与简历差异分析" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "开始差异分析", exact: true }),
    ).toBeVisible();

    await page.goto(`${application.detailUrl}?tab=resume`);
    await page
      .getByRole("button", { name: "预览 resume-en.pdf", exact: true })
      .click();
    await expect(page.getByLabel("简历预览：resume-en.pdf")).toContainText(
      "私有预览，不会调用 AI 或 OCR",
    );
    await expect(page.getByTitle("预览 resume-en.pdf")).toHaveAttribute(
      "src",
      /\/api\/source-assets\/[0-9a-f-]+\/preview$/u,
    );
    await page.getByRole("button", { name: "关闭预览", exact: true }).click();

    const detailNav = page.getByRole("navigation", { name: "申请详情" });
    await expect(detailNav.getByRole("link")).toHaveText([
      "概览",
      "简历",
      "差异分析",
      "完善建议",
      "面试准备",
      "时间线",
    ]);

    await page.goto(`${application.detailUrl}?tab=jd`);
    await expect(
      page.getByRole("heading", { name: "岗位与简历差异分析" }),
    ).toBeVisible();

    await page.goto(`${application.detailUrl}?tab=improvements`);
    await expect(page.getByText("请先完成差异分析", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "前往差异分析" })).toHaveAttribute(
      "href",
      `/applications/${application.applicationId}?tab=difference`,
    );

    await page.goto(`${application.detailUrl}?tab=overview`);
    await page.getByRole("button", { name: "删除记录", exact: true }).click();
    await expect(
      page.getByText("确定删除 Acme GmbH · Product Analyst？", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "确认删除记录", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications$/u);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
