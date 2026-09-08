import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const password = "CareerMint123!";
const jdText =
  "Lead product discovery for a European marketplace team. Measure customer outcomes with SQL and dashboards. Work with business stakeholders across three markets.";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`interview-generation-e2e-${name.toLowerCase()}-missing`);
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
  const email = `interview-generation-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Interview Test" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("interview-generation-e2e-user-not-created");
  }
  return { email, userId: created.data.user.id };
}

async function prepareAccount(
  page: Page,
  account: SupabaseClient,
  email: string,
  userId: string,
  { grantConsent = true } = {},
) {
  const signedIn = await account.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  await login(page, email);
  if (/\/onboarding/u.test(page.url())) {
    await page.getByLabel("姓名").fill("Interview Test");
    await page.getByLabel("目标岗位").fill("Product Manager");
    await page.getByRole("button", { name: "保存求职目标" }).click();
    await page.getByRole("button", { name: "暂时跳过" }).click();
    await page.getByRole("button", { name: "进入工作台" }).click();
  }
  if (!grantConsent) return;
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
  await page.getByLabel("JD 原文").fill(jdText);
  await page.getByRole("button", { name: "建立申请工作区" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+\?tab=resume&setup=1$/u);
  const applicationId = new URL(page.url()).pathname.split("/").pop();
  if (!applicationId) throw new Error("interview-generation-e2e-application-id-missing");
  return applicationId;
}

test("previews JD-grounded questions, adds the chosen one, and reuses the run", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  const generateBodies: (string | null)[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (!new URL(request.url()).pathname.endsWith("/interview/questions/generate")) return;
    generateBodies.push(request.postData());
  });

  try {
    await prepareAccount(page, account, email, userId);
    const applicationId = await createApplication(page);

    await page.goto(`/applications/${applicationId}?tab=interview`);
    await page.getByRole("button", { name: "生成岗位增量题" }).click();

    const candidates = page.locator('[aria-label="岗位增量题候选"]');
    await expect(candidates).toContainText(
      "How would you lead product discovery for this role?",
    );
    await expect(candidates).toContainText(
      "How would you measure customer outcomes in this role?",
    );

    // Questions must be grounded in the job description, not in the difference
    // analysis — the difference analysis is for revising the resume.
    await expect(candidates).toContainText(`JD 依据：“${jdText}”`);

    await page
      .getByRole("checkbox", {
        name: "How would you lead product discovery for this role?",
      })
      .check();
    await page.getByRole("button", { name: "加入所选题库" }).click();

    // The accepted question leaves the candidate preview and joins the list.
    const preparationList = page
      .getByRole("heading", { name: "本岗位准备清单" })
      .locator("xpath=ancestor::section[1]");
    await expect(preparationList).toContainText(
      "How would you lead product discovery for this role?",
    );
    await expect(preparationList).not.toContainText(
      "How would you measure customer outcomes in this role?",
    );

    // Same JD, same resume, same prompt: the second request must reuse the
    // stored run rather than pay for another generation.
    await page.getByRole("button", { name: "生成岗位增量题" }).click();
    await expect(page.getByRole("status")).toContainText(
      "已复用相同资料的生成结果，请先预览，再决定。",
    );
    expect(generateBodies).toHaveLength(2);

    const runs = await account
      .from("interview_question_generation_runs")
      .select("id", { count: "exact", head: true })
      .eq("application_id", applicationId);
    if (runs.error) throw runs.error;
    expect(runs.count).toBe(1);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});

test("will not generate before the user has allowed AI processing", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);
  try {
    await prepareAccount(page, account, email, userId, { grantConsent: false });
    const applicationId = await createApplication(page);

    await page.goto(`/applications/${applicationId}?tab=interview`);

    await expect(
      page.getByRole("button", { name: "生成岗位增量题" }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "生成岗位增量题前，需要先允许 AI 数据处理。" }),
    ).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
