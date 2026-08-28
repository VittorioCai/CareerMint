import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const password = "CareerMint123!";
const jdText = [
  "We are hiring a Product Analyst.",
  "Use SQL for funnel analysis and communicate findings to business stakeholders.",
  "Build dashboards, explain measurable outcomes, and confirm German C1.",
].join(" ");
const injectedOcrText = [
  "Product analyst with SQL funnel analysis experience.",
  "Built dashboards and communicated measurable outcomes to business stakeholders.",
  "Prepared weekly reporting for commercial decisions.",
].join(" ");

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`resume-difference-e2e-${name.toLowerCase()}-missing`);
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

async function createUser(admin: AdminClient, label: string) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `difference-${label}-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Difference Test" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("resume-difference-e2e-user-not-created");
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
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding|\/app/u);
  if (/\/onboarding/u.test(page.url())) {
    await page.getByLabel("姓名").fill("Difference Test");
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
  await page.getByLabel("岗位链接").fill("https://example.com/jobs/analyst");
  await page.getByLabel("JD 原文").fill(jdText);
  await page.getByRole("button", { name: "建立申请工作区" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+\?tab=resume&setup=1$/u);
  const applicationId = new URL(page.url()).pathname.split("/").pop();
  if (!applicationId) throw new Error("resume-difference-e2e-id-missing");
  return { applicationId, detailUrl: `/applications/${applicationId}` };
}

async function uploadBaseline(
  page: Page,
  applicationId: string,
  fixture = "tests/fixtures/resume-en.pdf",
) {
  await page.getByLabel("上传新的 PDF 或 DOCX 简历").setInputFiles(fixture);
  await page.getByRole("button", { name: "上传并使用这份简历" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/applications/${applicationId}\\?tab=difference&setup=1$`, "u"),
  );
}

test("runs one grounded analysis and reuses the same run for improvements", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin, "complete");
  const analyzePosts: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/resume-jd-difference/analyze")
    ) {
      analyzePosts.push(request.url());
    }
  });

  try {
    await prepareAccount(page, account, email, userId);

    const skipped = await createApplication(page, "No Resume Ltd", "Analyst");
    await page.getByRole("button", { name: "暂时跳过，进入申请" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/applications/${skipped.applicationId}\\?tab=difference&setup=1$`, "u"),
    );
    await expect(page.getByRole("link", { name: "先选择对照简历" })).toHaveAttribute(
      "href",
      `/applications/${skipped.applicationId}?tab=resume`,
    );

    const application = await createApplication(page, "Example Labs", "Product Analyst");
    await uploadBaseline(page, application.applicationId);
    await page.goto(`${application.detailUrl}?tab=resume`);
    await page.getByRole("button", { name: "预览 resume-en.pdf" }).click();
    await expect(page.getByLabel("简历预览：resume-en.pdf")).toBeVisible();
    await page.getByRole("button", { name: "关闭预览" }).click();

    await page.goto(`${application.detailUrl}?tab=difference`);
    await page.getByRole("button", { name: "开始差异分析" }).click();
    await expect(page.getByRole("heading", { name: "岗位核心判断" })).toBeVisible();
    expect(analyzePosts).toHaveLength(1);
    await expect(page.getByTestId("top-difference")).toHaveCount(3);
    await expect(page.getByTestId(/^difference-issue-/u)).toHaveCount(3);
    await expect(page.getByTestId(/^gate-issue-/u)).toHaveCount(1);
    const matched = page.getByTestId("matched-details");
    await expect(matched).not.toHaveAttribute("open", "");
    await matched.locator("summary").click();
    await expect(matched).toHaveAttribute("open", "");

    const firstDifference = page.getByTestId(/^difference-issue-/u).first();
    await firstDifference.locator("summary").click();
    await expect(firstDifference.getByText("JD 原文", { exact: true })).toBeVisible();
    await expect(firstDifference.getByText("中文解释", { exact: true })).toBeVisible();
    const differenceRunId = await page
      .locator("section[data-run-id]")
      .getAttribute("data-run-id");
    expect(differenceRunId).toMatch(/^[0-9a-f-]{36}$/u);

    await page.getByRole("link", { name: "查看完善建议" }).click();
    await expect(page.getByRole("heading", { name: "完善建议", exact: true })).toBeVisible();
    await expect(page.locator("section[data-run-id]")).toHaveAttribute(
      "data-run-id",
      differenceRunId!,
    );
    await expect(page.getByTestId(/^improvement-item-/u)).toHaveCount(4);
    await page.getByRole("link", { name: "进入面试准备" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/applications/${application.applicationId}\\?tab=interview$`, "u"),
    );

    await page.goto(`${application.detailUrl}?tab=jd`);
    await expect(page.getByRole("heading", { name: "岗位与简历差异分析" })).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});

test("marks old analysis stale and keeps previous results explicit during retry states", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin, "stale");

  try {
    await prepareAccount(page, account, email, userId);
    const application = await createApplication(page, "Change Labs", "Data Analyst");
    await uploadBaseline(page, application.applicationId);
    await page.getByRole("button", { name: "开始差异分析" }).click();
    await expect(page.getByRole("heading", { name: "岗位核心判断" })).toBeVisible();

    await page.goto(`${application.detailUrl}?tab=resume`);
    await page.getByRole("button", { name: "上传新简历" }).click();
    await page
      .getByLabel("上传新的 PDF 或 DOCX 简历")
      .setInputFiles("tests/fixtures/resume-zh.docx");
    await page.getByRole("button", { name: "上传并使用这份简历" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/applications/${application.applicationId}\\?tab=resume$`, "u"),
    );
    await expect(
      page.getByRole("button", { name: "预览 resume-zh.docx", exact: true }).first(),
    ).toBeVisible();

    await page.goto(`${application.detailUrl}?tab=difference`);
    await expect(page.getByText(/材料已变化，请重新分析/u)).toBeVisible();
    await expect(page.getByRole("heading", { name: "岗位核心判断" })).toHaveCount(0);
    await page.goto(`${application.detailUrl}?tab=improvements`);
    await expect(page.getByText("材料已变化，请重新分析", { exact: true })).toBeVisible();

    await page.route("**/resume-jd-difference/analyze", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          status: "running",
          reused: false,
          freshness: "current",
          errorCode: null,
        }),
      });
    });
    await page.goto(`${application.detailUrl}?tab=difference`);
    await page.getByRole("button", { name: "重新分析" }).click();
    await expect(page.getByRole("link", { name: "查看上次结果" })).toBeVisible();
    await page.getByRole("link", { name: "查看上次结果" }).click();
    await expect(page.getByRole("heading", { name: "岗位核心判断" })).toBeVisible();
    await expect(page.getByRole("link", { name: "导出 Markdown" })).toHaveAttribute(
      "href",
      /stale=1/u,
    );

    await page.unroute("**/resume-jd-difference/analyze");
    await page.route("**/resume-jd-difference/analyze", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          status: "failed",
          reused: false,
          freshness: "current",
          errorCode: "ai-timeout",
        }),
      });
    });
    await page.goto(`${application.detailUrl}?tab=difference`);
    await page.getByRole("button", { name: "重新分析" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "分析服务响应超时" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "查看上次结果" })).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});

test("recovers scanned PDF text through OCR and remains usable on mobile", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin, "ocr");
  const analyzeBodies: Array<string | null> = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/resume-jd-difference/analyze")
    ) {
      analyzeBodies.push(request.postData());
    }
  });

  try {
    await prepareAccount(page, account, email, userId);
    await page.addInitScript((ocrText) => {
      window.__JOB_BUDDY_E2E_OCR__ = async (_file, options) => {
        options?.onProgress?.({ phase: "loading-model" });
        options?.onProgress?.({ phase: "recognizing", page: 1, totalPages: 1 });
        return ocrText;
      };
    }, injectedOcrText);
    const application = await createApplication(page, "OCR Labs", "Insights Analyst");
    await uploadBaseline(
      page,
      application.applicationId,
      "tests/fixtures/resume-scanned.pdf",
    );

    await page.getByRole("button", { name: "开始差异分析" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "没有读到足够的简历文字" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "在本机识别扫描版 PDF" }).click();
    await expect(page.getByRole("heading", { name: "岗位核心判断" })).toBeVisible();
    expect(analyzeBodies).toHaveLength(2);
    expect(analyzeBodies[0]).toBeNull();
    expect(analyzeBodies[1]).toContain('"ocrText"');
    expect(analyzeBodies[1]).toContain("Product analyst with SQL funnel analysis");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      )
      .toBe(true);
    const summary = page.getByTestId(/^difference-issue-/u).first().locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId(/^difference-issue-/u).first()).toHaveAttribute(
      "open",
      "",
    );
    await expect(page.getByRole("button", { name: "重新分析" })).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
