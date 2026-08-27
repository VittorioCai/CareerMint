import {
  expect,
  test,
  type Page,
  type Response as PlaywrightResponse,
} from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

type AdvanceBody = {
  status: "queued" | "running" | "succeeded" | "failed";
  phase: "structure" | "comparison" | "complete";
  nextPhase: "comparison" | null;
  structureRunId: string | null;
  gapRunId: string | null;
  reused: boolean;
  errorCode: string | null;
};

const password = "CareerMint123!";
const jdText = [
  "E2E JD GAP V3 FIXTURE.",
  "A Product Analyst degree or a comparable degree is accepted.",
  "Advanced SQL or Python is required for customer funnel analysis.",
  "You must show a measurable checkout conversion result.",
  "At least five years of product analytics experience is required.",
  "German C1 is required.",
  "Valid German work authorization is mandatory.",
  "You will conduct funnel analysis for product decisions.",
  "Quantum forecasting experience is preferred.",
  "A business informatics degree is mandatory; no equivalent field is accepted.",
  "Tableau dashboard experience is required.",
  "You will facilitate stakeholder workshops.",
  "You will conduct market research.",
  "A/B experimentation experience is required.",
].join(" ");

const ocrResumeText = [
  "Product Analyst.",
  "M.Sc. Management and Digital Technology.",
  "Used SQL for funnel analysis.",
  "Improved checkout conversion by 18%.",
  "Three years of product analytics experience.",
  "German B2.",
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
  await expect(page).toHaveURL(/\/onboarding|\/app/);
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
  if (/\/onboarding/.test(page.url())) {
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

async function insertConfirmedFact(account: AdminClient, userId: string) {
  const id = crypto.randomUUID();
  const inserted = await account.from("career_facts").insert({
    id,
    user_id: userId,
    fact_type: "achievement",
    data: {
      title: "Checkout conversion improvement",
      organization: "Acme GmbH",
      startDate: null,
      endDate: null,
      description: "Improved checkout conversion by 18% through funnel analysis using SQL.",
      skills: ["SQL", "Funnel analysis"],
    },
    source_excerpt: "Improved checkout conversion by 18% through funnel analysis using SQL.",
    confirmation_status: "confirmed",
    confirmed_at: new Date().toISOString(),
  });
  if (inserted.error) throw inserted.error;
  return id;
}

async function createApplication(page: Page, companyName: string, roleTitle: string) {
  await page.goto("/applications/new");
  await page.getByLabel("公司").fill(companyName);
  await page.getByLabel("职位").fill(roleTitle);
  await page.getByLabel("地点").fill("Berlin, Germany");
  await page.getByLabel("办公方式").selectOption("hybrid");
  await page.getByLabel("来源").fill("Company site");
  await page.getByLabel("岗位链接").fill("https://example.com/jobs/product-analyst");
  await page.getByLabel("JD 原文").fill(jdText);
  await expect(page.getByText("草稿已保存在当前浏览器")).toBeVisible();
  await page.getByRole("button", { name: "建立申请工作区" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+\?tab=resume&setup=1$/);
  const applicationId = new URL(page.url()).pathname.split("/").pop();
  if (!applicationId) throw new Error("application-e2e-id-missing");
  return { applicationId, detailUrl: `/applications/${applicationId}` };
}

async function uploadBaseline(page: Page, file: string, expectedUrl: RegExp) {
  const filename = file.split("/").at(-1);
  if (!filename) throw new Error("application-e2e-baseline-filename-missing");
  await page.getByLabel("上传新的 PDF 或 DOCX 简历").setInputFiles(file);
  await page.getByRole("button", { name: "上传并使用这份简历" }).click();
  await expect(page).toHaveURL(expectedUrl);
  if (new URL(page.url()).searchParams.get("tab") === "resume") {
    await expect(
      page.getByRole("button", { name: `预览 ${filename}`, exact: true }),
    ).toBeVisible();
  }
}

function isGapAdvanceResponse(response: PlaywrightResponse) {
  const pathname = new URL(response.url()).pathname;
  return (
    /\/api\/applications\/[0-9a-f-]+\/jd-gap\/analyze$/u.test(pathname) &&
    response.request().method() === "POST"
  );
}

async function clickAndCollectGapAdvance(
  page: Page,
  action: () => Promise<void>,
  expectedCount = 2,
) {
  const responses: PlaywrightResponse[] = [];
  const listener = (response: PlaywrightResponse) => {
    if (isGapAdvanceResponse(response)) responses.push(response);
  };
  page.on("response", listener);
  try {
    await action();
    await expect.poll(() => responses.length, { timeout: 60_000 }).toBe(expectedCount);
    const bodies = await Promise.all(
      responses.map(async (response, index) => {
        const body = await response.json() as AdvanceBody;
        expect(
          response.ok(),
          JSON.stringify({ index, status: response.status(), body }),
        ).toBe(true);
        return body;
      }),
    );
    return { responses, bodies };
  } finally {
    page.off("response", listener);
  }
}

async function expectSummary(
  page: Page,
  expected: Record<"总要求" | "完全匹配" | "部分匹配" | "未覆盖" | "阻断项", number>,
) {
  const summary = page.getByLabel("JD 差距摘要");
  await expect(summary).toBeVisible();
  for (const [label, value] of Object.entries(expected)) {
    const item = summary.locator("div").filter({ has: page.locator("dt", { hasText: label }) });
    await expect(item).toContainText(String(value));
  }
}

async function tableCount(
  account: AdminClient,
  table: "jd_structure_runs" | "jd_gap_v3_runs",
  applicationId: string,
) {
  const rows = await account
    .from(table)
    .select("id,attempt_count,status", { count: "exact" })
    .eq("application_id", applicationId);
  if (rows.error) throw rows.error;
  return rows;
}

async function createLegacyVersion(
  account: AdminClient,
  applicationId: string,
  factId: string,
  requirementId: string,
) {
  const inputHash = crypto.randomUUID().replaceAll("-", "").padEnd(64, "0");
  const createdRun = await account.rpc("create_or_get_resume_generation", {
    target_application_id: applicationId,
    target_input_hash: inputHash,
    target_provider: "e2e-fixture",
    target_model: "e2e-fixture-v1",
  });
  if (createdRun.error || !createdRun.data) {
    throw createdRun.error ?? new Error("resume-version-fixture-run-missing");
  }
  const runId = createdRun.data.id;
  const claimed = await account.rpc("claim_resume_generation", { target_run_id: runId });
  if (claimed.error || claimed.data !== true) {
    throw claimed.error ?? new Error("resume-version-fixture-claim-failed");
  }
  const completed = await account.rpc("complete_resume_generation", {
    target_run_id: runId,
    accepted_suggestions: [{
      section: "experience",
      content: "Improved checkout conversion through funnel analysis.",
      reason: "Fixture content is grounded in a confirmed career fact.",
      factIds: [factId],
      requirementIds: [requirementId],
    }],
    rejected_suggestion_count: 0,
    rejected_reference_count: 0,
    ai_usage: {
      provider: "e2e-fixture",
      model: "e2e-fixture-v1",
      requestId: null,
      usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 0, outputTokens: 0 },
      priceScheduleVersion: null,
    },
    estimated_cost: null,
  });
  if (completed.error || !completed.data) {
    throw completed.error ?? new Error("resume-version-fixture-complete-failed");
  }
  const suggestion = await account
    .from("resume_suggestions")
    .select("id")
    .eq("run_id", runId)
    .single();
  if (suggestion.error || !suggestion.data) {
    throw suggestion.error ?? new Error("resume-version-fixture-suggestion-missing");
  }
  const reviewed = await account.rpc("review_resume_suggestion", {
    target_suggestion_id: suggestion.data.id,
    target_decision: "accepted",
    target_reviewed_content: "Improved checkout conversion through funnel analysis.",
  });
  if (reviewed.error || !reviewed.data) {
    throw reviewed.error ?? new Error("resume-version-fixture-review-failed");
  }
  const version = await account.rpc("create_resume_version", {
    target_application_id: applicationId,
    target_source_run_id: runId,
    target_template: "simple",
  });
  if (version.error || !version.data) {
    throw version.error ?? new Error("resume-version-fixture-version-missing");
  }
  return { versionId: version.data.id };
}

test("covers the evidence-based JD gap analysis v3 workflow", async ({ page }) => {
  test.setTimeout(300_000);
  if (process.env.E2E_FAKE_EXTRACTOR !== "1") {
    test.skip(true, "set E2E_FAKE_EXTRACTOR=1 to keep this E2E deterministic and free");
  }

  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);
  try {
    await page.addInitScript((fixtureText) => {
      const browser = globalThis as typeof globalThis & {
        __JOB_BUDDY_E2E_OCR__?: (
          file: File,
          options?: {
            onProgress?: (progress: {
              phase: "recognizing";
              page: number;
              totalPages: number;
            }) => void;
          },
        ) => Promise<string>;
      };
      browser.__JOB_BUDDY_E2E_OCR__ = async (_file, options) => {
        options?.onProgress?.({ phase: "recognizing", page: 1, totalPages: 2 });
        options?.onProgress?.({ phase: "recognizing", page: 2, totalPages: 2 });
        return fixtureText;
      };
    }, ocrResumeText);
    await prepareAccount(page, account, email, userId);
    const factId = await insertConfirmedFact(account, userId);

    const first = await createApplication(page, "Acme GmbH", "Product Analyst");
    await uploadBaseline(
      page,
      "tests/fixtures/resume-en.pdf",
      new RegExp(`/applications/${first.applicationId}\\?tab=jd&setup=1$`),
    );

    await page.goto(`${first.detailUrl}?tab=resume`);
    await page.getByRole("button", { name: "预览 resume-en.pdf", exact: true }).click();
    await expect(page.getByLabel("简历预览：resume-en.pdf")).toContainText(
      "私有预览，不会调用 AI 或 OCR",
    );
    await expect(page.getByTitle("预览 resume-en.pdf")).toHaveAttribute(
      "src",
      /\/api\/source-assets\/[0-9a-f-]+\/preview$/,
    );
    await page.getByRole("button", { name: "关闭预览", exact: true }).click();

    await page.goto(`${first.detailUrl}?tab=jd`);
    expect((await tableCount(account, "jd_structure_runs", first.applicationId)).count).toBe(0);
    expect((await tableCount(account, "jd_gap_v3_runs", first.applicationId)).count).toBe(0);

    const initialAdvance = await clickAndCollectGapAdvance(
      page,
      () => page.getByRole("button", { name: "开始 JD 差距分析", exact: true }).click(),
    );
    expect(initialAdvance.bodies.map((body) => body.phase)).toEqual(["structure", "complete"]);
    expect(initialAdvance.bodies.map((body) => body.reused)).toEqual([false, false]);
    await expect(page.getByRole("heading", { name: "JD 差距分析" })).toBeVisible();
    await expectSummary(page, {
      总要求: 13,
      完全匹配: 3,
      部分匹配: 0,
      未覆盖: 9,
      阻断项: 3,
    });

    for (const tab of ["待补差距", "全部要求", "JD 内容"]) {
      await expect(page.getByRole("tab", { name: tab, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "阻断差距" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "重要差距" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "次要差距" })).toBeVisible();
    await expect(page.getByRole("button", { name: "还有 1 条，展开全部" })).toBeVisible();
    await page.getByRole("button", { name: "还有 1 条，展开全部" }).click();
    await expect(page.getByRole("button", { name: /需要具备 A\/B 实验经验/ })).toBeVisible();

    const sqlRequirement = page.getByRole("button", {
      name: /客户漏斗分析需要高级 SQL 或 Python/,
    });
    await sqlRequirement.click();
    const sqlArticle = sqlRequirement.locator("xpath=..");
    await expect(sqlArticle.getByText("高级 SQL", { exact: true })).toBeVisible();
    await expect(sqlArticle.getByText("Python", { exact: true }).first()).toBeVisible();
    await expect(sqlArticle.getByText("未在简历中找到直接证据", { exact: true }).first()).toBeVisible();
    await expect(sqlArticle.getByText("职业档案支持", { exact: true })).toBeVisible();
    await expect(sqlArticle.getByText("Checkout conversion improvement", { exact: true })).toBeVisible();
    await expect(sqlArticle).toContainText("职业档案有相关事实，但所选简历没有直接证据。");
    await expect(sqlRequirement).toContainText("未覆盖");

    await page.getByRole("tab", { name: "全部要求", exact: true }).click();
    await page.getByRole("button", { name: "还有 1 条，展开全部" }).click();
    await expect(page.locator('[data-testid^="gap-requirement-"]')).toHaveCount(13);
    const completed = page.locator("details").filter({ hasText: "完整匹配（3）" });
    await expect(completed).not.toHaveAttribute("open", "");
    await completed.locator("summary").click();
    const comparableDegree = page.getByRole("button", {
      name: /接受产品分析或可比专业学位/,
    });
    await expect(comparableDegree).toContainText("完全匹配");
    const strictDegree = page.getByRole("button", {
      name: /必须是商业信息学学位，不接受相近专业/,
    });
    await expect(strictDegree).toContainText("未覆盖");

    const outcomeRequirement = completed.getByRole("button", {
      name: /必须展示可量化的结账转化成果/,
    });
    await outcomeRequirement.click();
    await expect(page.getByText("简历原句", { exact: true })).toBeVisible();
    await expect(page.getByText(/Improved checkout conversion by 18%/)).toBeVisible();

    const allPanelText = await page.getByRole("tabpanel").textContent();
    expect(allPanelText?.indexOf("接受产品分析或可比专业学位")).toBeLessThan(
      allPanelText?.indexOf("A Product Analyst degree") ?? -1,
    );

    await page.getByRole("tab", { name: "JD 内容", exact: true }).click();
    await expect(page.getByText(/E2E 测试岗位：包含可比专业/)).toBeVisible();
    const sourceDisclosure = page.getByText("查看 JD 原文", { exact: true }).locator("xpath=..");
    await expect(sourceDisclosure).not.toHaveAttribute("open", "");
    await page.getByText("查看 JD 原文", { exact: true }).click();
    await expect(page.getByText(jdText, { exact: true })).toBeVisible();

    const reusedAdvance = await clickAndCollectGapAdvance(
      page,
      () => page.getByRole("button", { name: "重新分析 JD 差距", exact: true }).click(),
      1,
    );
    expect(reusedAdvance.bodies.map((body) => body.phase)).toEqual(["complete"]);
    expect(reusedAdvance.bodies.every((body) => body.reused)).toBe(true);
    const structureRuns = await tableCount(account, "jd_structure_runs", first.applicationId);
    const gapRuns = await tableCount(account, "jd_gap_v3_runs", first.applicationId);
    expect(structureRuns.count).toBe(1);
    expect(structureRuns.data).toEqual([
      expect.objectContaining({ attempt_count: 1, status: "succeeded" }),
    ]);
    expect(gapRuns.count).toBe(1);
    expect(gapRuns.data).toEqual([
      expect.objectContaining({ attempt_count: 1, status: "succeeded" }),
    ]);

    await page.getByRole("tab", { name: "待补差距", exact: true }).click();
    const markdownResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/jd-gap/export") &&
        response.request().method() === "GET",
    );
    await page.getByRole("button", { name: "导出 Markdown", exact: true }).click();
    const markdownResponse = await markdownResponsePromise;
    expect(markdownResponse.ok()).toBe(true);
    expect(markdownResponse.headers()["content-type"]).toContain("text/markdown");
    expect(markdownResponse.headers()["content-disposition"]).toContain(".md");
    const markdownInspection = await page.context().request.get(
      `/api/applications/${first.applicationId}/jd-gap/export`,
    );
    expect(markdownInspection.ok()).toBe(true);
    const markdown = await markdownInspection.text();
    expect(markdown).toContain("JD 差距分析");
    expect(markdown).toContain("未覆盖");
    expect(markdown).not.toContain("E2E JD GAP V3 FIXTURE.");
    expect(markdown).not.toContain(
      "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.",
    );
    await expect(
      page.getByText("Markdown 已下载。文件只包含当前未解决差距。", { exact: true }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${first.detailUrl}?tab=jd`);
    await expect(page.getByRole("button", { name: "还有 1 条，展开全部" })).toBeVisible();
    await page.getByRole("button", { name: "还有 1 条，展开全部" }).click();
    await expect(page.getByRole("button", { name: /需要具备 A\/B 实验经验/ })).toBeVisible();
    const authorizationRequirement = page.getByRole("button", {
      name: /必须持有有效的德国工作许可/,
    });
    await authorizationRequirement.focus();
    await authorizationRequirement.press("Enter");
    await expect(authorizationRequirement).toHaveAttribute("aria-expanded", "true");
    await expect(authorizationRequirement.locator("xpath=..")).toContainText(
      "语言或工作许可需要确认",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const oldText of ["正文预览", "AI 建议", "证据切换", "建议/证据"]) {
      await expect(page.getByText(oldText, { exact: true })).toHaveCount(0);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${first.detailUrl}?tab=resume`);
    await page.getByRole("button", { name: "上传新简历", exact: true }).click();
    await uploadBaseline(
      page,
      "tests/fixtures/resume-scanned.pdf",
      new RegExp(`/applications/${first.applicationId}\\?tab=resume$`),
    );
    await page.goto(`${first.detailUrl}?tab=jd`);
    await expect(page.getByLabel("JD 差距摘要")).toHaveCount(0);
    await expect(page.getByText("尚未生成差距结果。选择对照简历后，点击上方按钮开始分析。", {
      exact: true,
    })).toBeVisible();

    const scannedFailure = await clickAndCollectGapAdvance(
      page,
      () => page.getByRole("button", { name: "开始 JD 差距分析", exact: true }).click(),
      1,
    );
    expect(scannedFailure.bodies[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        phase: "comparison",
        errorCode: "resume-text-too-short",
      }),
    );
    await expect(
      page.getByRole("button", { name: "在本机识别扫描版 PDF", exact: true }),
    ).toBeVisible();
    const ocrAdvance = await clickAndCollectGapAdvance(
      page,
      () => page.getByRole("button", { name: "在本机识别扫描版 PDF", exact: true }).click(),
      1,
    );
    expect(ocrAdvance.bodies[0]).toEqual(
      expect.objectContaining({ status: "succeeded", phase: "complete", reused: false }),
    );
    const ocrRequest = ocrAdvance.responses.find(
      (response) => response.request().postData() !== null,
    );
    expect(ocrRequest?.request().postDataJSON()).toEqual({
      ocrText: expect.stringContaining("Three years of product analytics experience"),
    });
    await expectSummary(page, {
      总要求: 13,
      完全匹配: 4,
      部分匹配: 1,
      未覆盖: 7,
      阻断项: 3,
    });
    const yearsRequirement = page.getByRole("button", {
      name: /需要至少五年产品分析经验/,
    });
    await expect(yearsRequirement).toContainText("部分匹配");

    const second = await createApplication(page, "Beta GmbH", "Strategy Intern");
    await page.getByRole("button", { name: "预览 resume-en.pdf", exact: true }).click();
    await expect(page.getByTitle("预览 resume-en.pdf")).toHaveAttribute(
      "src",
      /\/api\/source-assets\/[0-9a-f-]+\/preview$/,
    );
    await page.getByRole("button", { name: "关闭预览", exact: true }).click();
    await page.getByRole("button", { name: "暂时跳过，进入申请", exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/applications/${second.applicationId}\\?tab=jd&setup=1$`),
    );
    await expect(page.getByRole("button", { name: "开始 JD 差距分析" })).toBeDisabled();
    expect((await tableCount(account, "jd_structure_runs", second.applicationId)).count).toBe(0);
    expect((await tableCount(account, "jd_gap_v3_runs", second.applicationId)).count).toBe(0);

    const legacyResponse = await page.context().request.post(
      `/api/applications/${second.applicationId}/analyze`,
    );
    expect(legacyResponse.ok()).toBe(true);
    await page.goto(`${second.detailUrl}?tab=jd`);
    await expect(
      page.getByText("这是旧版分析，请重新分析以查看详细差距。", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("理解并推进这份岗位描述中的核心职责", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByLabel("JD 差距摘要")).toHaveCount(0);

    await page.goto(`${second.detailUrl}?tab=resume`);
    await page.getByRole("button", { name: "选择 resume-en.pdf", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/applications/${second.applicationId}\\?tab=resume$`));
    await page.goto(`${second.detailUrl}?tab=jd`);
    const secondAdvance = await clickAndCollectGapAdvance(
      page,
      () => page.getByRole("button", { name: "开始 JD 差距分析", exact: true }).click(),
    );
    expect(secondAdvance.bodies.at(-1)).toEqual(
      expect.objectContaining({ status: "succeeded", phase: "complete" }),
    );
    await expect(page.getByLabel("JD 差距摘要")).toBeVisible();
    await expect(
      page.getByText("这是旧版分析，请重新分析以查看详细差距。", { exact: true }),
    ).toHaveCount(0);

    const requirements = await account
      .from("application_requirements")
      .select("id")
      .eq("application_id", second.applicationId)
      .limit(1);
    if (requirements.error || !requirements.data[0]) {
      throw requirements.error ?? new Error("resume-version-fixture-requirement-missing");
    }
    const legacy = await createLegacyVersion(
      account,
      second.applicationId,
      factId,
      requirements.data[0].id,
    );
    await page.goto(`${second.detailUrl}/resume/${legacy.versionId}`);
    await expect(page.getByText("不可变快照", { exact: true })).toBeVisible();

    const docxResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/export") &&
        response.url().includes("format=docx"),
    );
    const docxDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载 DOCX", exact: true }).click();
    const [docxResponse, docxDownload] = await Promise.all([
      docxResponsePromise,
      docxDownloadPromise,
    ]);
    expect(docxResponse.ok()).toBe(true);
    expect(docxDownload.suggestedFilename()).toMatch(/\.docx$/);
    expect(await docxDownload.failure()).toBeNull();

    const pdfResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/export") &&
        response.url().includes("format=pdf"),
    );
    const pdfDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载 PDF", exact: true }).click();
    const [pdfResponse, pdfDownload] = await Promise.all([
      pdfResponsePromise,
      pdfDownloadPromise,
    ]);
    expect(pdfResponse.ok()).toBe(true);
    expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await pdfDownload.failure()).toBeNull();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
