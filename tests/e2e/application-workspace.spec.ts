import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const password = "CareerMint123!";
const jdText =
  "Lead product discovery, partner with engineering, define strategy, and measure customer outcomes across international markets.";

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

async function prepareAccount(page: Page, account: AdminClient, email: string, userId: string) {
  const signedIn = await account.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;

  await login(page, email);
  if (/\/onboarding/.test(page.url())) {
    await page.getByLabel("姓名").fill("Application Test");
    await page.getByLabel("目标岗位").fill("Product Manager");
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
      description: "Improved checkout conversion by 18% through funnel analysis.",
      skills: ["SQL", "Funnel analysis"],
    },
    source_excerpt: "Improved checkout conversion by 18% through funnel analysis.",
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
  await page.getByLabel("岗位链接").fill("https://example.com/jobs/product-manager");
  await page.getByLabel("JD 原文").fill(jdText);
  await expect(page.getByText("草稿已保存在当前浏览器")).toBeVisible();
  await page.getByRole("button", { name: "建立申请工作区" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+\?tab=resume&setup=1$/);
  const applicationId = new URL(page.url()).pathname.split("/").pop();
  if (!applicationId) throw new Error("application-e2e-id-missing");
  return { applicationId, detailUrl: `/applications/${applicationId}` };
}

async function uploadBaseline(
  page: Page,
  file: string,
  expectedUrl: RegExp,
) {
  await page.getByLabel("上传新的 PDF 或 DOCX 简历").setInputFiles(file);
  await page.getByRole("button", { name: "上传并使用这份简历" }).click();
  await expect(page).toHaveURL(expectedUrl);
}

async function analyzeJD(page: Page, detailUrl: string) {
  await page.goto(`${detailUrl}?tab=jd`);
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/analyze") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "开始分析 JD", exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  await expect(page.getByText("分析完成，匹配结果已更新。", { exact: true })).toBeVisible();
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
    accepted_suggestions: [
      {
        section: "experience",
        content: "Improved checkout conversion through funnel analysis.",
        reason: "Fixture content is grounded in a confirmed career fact.",
        factIds: [factId],
        requirementIds: [requirementId],
      },
    ],
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
  return { runId, versionId: version.data.id };
}

test("covers the application workspace JD and resume-gap paths", async ({ page }) => {
  test.setTimeout(180_000);
  const visualQa = process.env.VISUAL_QA === "1";
  if (process.env.E2E_FAKE_EXTRACTOR !== "1") {
    test.skip(true, "set E2E_FAKE_EXTRACTOR=1 to keep this E2E deterministic and free");
  }
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);
  try {
    await page.addInitScript(() => {
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
        return "理解并推进这份岗位描述中的核心职责。OCR fixture text with enough verified resume context for recovery.";
      };
    });
    await prepareAccount(page, account, email, userId);

    await page.goto("/profile");
    await page.getByRole("button", { name: "＋ 手动添加事实" }).click();
    await page.getByRole("combobox", { name: "类型" }).selectOption("language");
    await page.getByRole("textbox", { name: "语言" }).fill("德语");
    await page.getByRole("textbox", { name: "熟练程度" }).fill("B2");
    await page.getByRole("textbox", { name: "证书或证明（可选）" }).fill("Goethe B2");
    await page.getByRole("button", { name: "保存为待确认" }).click();
    const languageFormError = page.locator("[data-error-code]");
    if (await languageFormError.count()) {
      throw new Error(
        `language-fact-save-${await languageFormError.getAttribute("data-error-code")}`,
      );
    }
    await expect(page.getByRole("button", { name: "＋ 手动添加事实" })).toBeVisible();
    const languageFact = await account
      .from("career_facts")
      .select("fact_type,data,confirmation_status")
      .eq("user_id", userId)
      .eq("fact_type", "language")
      .single();
    if (languageFact.error) throw languageFact.error;
    expect(languageFact.data.confirmation_status).toBe("pending");
    expect(languageFact.data.data).toEqual({
      title: "德语",
      organization: null,
      startDate: null,
      endDate: null,
      description: "熟练程度：B2\n证书或证明：Goethe B2",
      skills: [],
    });

    const factId = await insertConfirmedFact(account, userId);

    const first = await createApplication(page, "Acme GmbH", "Product Manager");
    await uploadBaseline(
      page,
      "tests/fixtures/resume-en.pdf",
      new RegExp(`/applications/${first.applicationId}\\?tab=jd&setup=1$`),
    );
    const firstAsset = await account
      .from("applications")
      .select("resume_source_asset_id")
      .eq("id", first.applicationId)
      .single();
    if (firstAsset.error || !firstAsset.data.resume_source_asset_id) {
      throw firstAsset.error ?? new Error("application-e2e-first-baseline-missing");
    }
    const firstAssetId = firstAsset.data.resume_source_asset_id;

    await analyzeJD(page, first.detailUrl);
    await page.goto(`${first.detailUrl}?tab=jd`);
    const orderedRequirementRows = await page
      .locator('button[aria-controls^="requirement-detail-"]')
      .allTextContents();
    expect(orderedRequirementRows[0]).toContain("需要十年量子计算领导经验");
    expect(orderedRequirementRows[1]).toContain("理解并推进这份岗位描述中的核心职责");
    await page.getByRole("button", { name: "JD 内容", exact: true }).click();
    const translatedJdDisclosure = page.getByText("JD 中文翻译", { exact: true });
    await expect(translatedJdDisclosure.locator("xpath=..")).not.toHaveAttribute("open", "");
    await translatedJdDisclosure.click();
    await expect(page.getByText(`中文翻译：${jdText}`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "重点", exact: true }).click();
    const requirementRow = page.getByRole("button", { name: /理解并推进这份岗位描述中的核心职责/ });
    await expect(requirementRow).toHaveAttribute("aria-expanded", "false");
    expect(await page.getByText("JD 来源摘录", { exact: true }).count()).toBe(0);
    if (visualQa) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: "/tmp/job-buddy-jd-desktop-default.png", fullPage: false });
      await page.getByRole("button", { name: "全部要求", exact: true }).click();
      await page.screenshot({ path: "/tmp/job-buddy-jd-all-desktop-default.png", fullPage: false });
      await page.getByRole("button", { name: "重点", exact: true }).click();
    }
    await requirementRow.click();
    await expect(page.getByText("JD 来源摘录", { exact: true })).toBeVisible();
    await expect(page.getByText(jdText, { exact: true })).toBeVisible();
    if (visualQa) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: "/tmp/job-buddy-jd-desktop.png", fullPage: false });
    }

    await page.goto(`${first.detailUrl}?tab=resume`);
    const firstGapResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/resume/gaps/analyze") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "分析简历差距", exact: true }).click();
    const firstGapResponse = await firstGapResponsePromise;
    expect(firstGapResponse.ok()).toBe(true);
    const firstGapBody = (await firstGapResponse.json()) as {
      runId: string;
      status: string;
      reused: boolean;
    };
    expect(firstGapBody.status).toBe("succeeded");
    expect(firstGapBody.reused).toBe(false);
    const gapSummary = page.getByLabel("简历差距摘要");
    for (const label of ["简历漏写", "部分覆盖", "缺少证据", "已经覆盖"]) {
      await expect(gapSummary.getByText(label, { exact: true })).toBeVisible();
    }
    const gapRow = page.getByRole("button", { name: /理解并推进这份岗位描述中的核心职责/ });
    await expect(gapRow).toHaveAttribute("aria-expanded", "false");
    await gapRow.click();
    await expect(page.getByText("JD 摘录", { exact: true })).toBeVisible();
    await expect(page.getByText("确定性说明", { exact: true })).toBeVisible();
    const markdownResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/resume/gaps/export") &&
        response.request().method() === "GET",
    );
    await page.getByRole("button", { name: "导出 Markdown", exact: true }).click();
    const markdownResponse = await markdownResponsePromise;
    expect(markdownResponse.ok()).toBe(true);
    expect(markdownResponse.headers()["content-type"]).toContain("text/markdown");
    expect(markdownResponse.headers()["content-disposition"]).toContain(".md");
    await expect(
      page.getByText("Markdown 已下载。文件只包含当前未解决差距。", {
        exact: true,
      }),
    ).toBeVisible();
    if (visualQa) {
      await page.screenshot({ path: "/tmp/job-buddy-resume-desktop.png", fullPage: false });
    }

    const reusedResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/resume/gaps/analyze") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "重新分析简历差距", exact: true }).click();
    const reusedResponse = await reusedResponsePromise;
    expect(reusedResponse.ok()).toBe(true);
    const reusedBody = (await reusedResponse.json()) as {
      runId: string;
      status: string;
      reused: boolean;
    };
    expect(reusedBody).toEqual({
      runId: firstGapBody.runId,
      status: "succeeded",
      reused: true,
      errorCode: null,
    });
    const gapRuns = await account
      .from("resume_gap_runs")
      .select("id,attempt_count", { count: "exact" })
      .eq("user_id", userId)
      .eq("application_id", first.applicationId);
    if (gapRuns.error) throw gapRuns.error;
    expect(gapRuns.count).toBe(1);
    expect(gapRuns.data).toEqual([{ id: firstGapBody.runId, attempt_count: 1 }]);

    await page.goto(`${first.detailUrl}?tab=interview`);
    await expect(page.getByText("Tell me about yourself.", { exact: true })).toBeVisible();
    const firstQuestionResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/interview/questions/generate") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "生成岗位增量题", exact: true }).click();
    const firstQuestionResponse = await firstQuestionResponsePromise;
    expect(firstQuestionResponse.ok()).toBe(true);
    const firstQuestionBody = (await firstQuestionResponse.json()) as {
      runId: string;
      status: string;
      reused: boolean;
    };
    expect(firstQuestionBody.status).toBe("succeeded");
    expect(firstQuestionBody.reused).toBe(false);
    await expect(page.getByLabel("岗位增量题候选")).toBeVisible();
    const reusedQuestionResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/interview/questions/generate") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "生成岗位增量题", exact: true }).click();
    const reusedQuestionResponse = await reusedQuestionResponsePromise;
    expect(reusedQuestionResponse.ok()).toBe(true);
    expect(await reusedQuestionResponse.json()).toEqual({
      runId: firstQuestionBody.runId,
      status: "succeeded",
      reused: true,
      errorCode: null,
    });
    const questionRuns = await account
      .from("interview_question_generation_runs")
      .select("id,attempt_count", { count: "exact" })
      .eq("user_id", userId)
      .eq("application_id", first.applicationId);
    if (questionRuns.error) throw questionRuns.error;
    expect(questionRuns.count).toBe(1);
    expect(questionRuns.data).toEqual([{ id: firstQuestionBody.runId, attempt_count: 1 }]);

    await page.goto(first.detailUrl);
    await page.getByLabel("新阶段").selectOption("applied");
    await page.getByLabel("备注（可选）").fill("Submitted on company site");
    await page.getByRole("button", { name: "确认更新阶段" }).click();
    await expect(page.getByText("阶段已更新，时间线已记录。", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "时间线", exact: true }).click();
    await expect(page.getByText("准备中 → 已投递", { exact: true })).toBeVisible();
    await expect(page.getByText("Submitted on company site", { exact: true })).toBeVisible();

    const second = await createApplication(page, "Beta GmbH", "Strategy Intern");
    await page.getByRole("button", { name: "预览 resume-en.pdf", exact: true }).click();
    await expect(page.getByTitle("预览 resume-en.pdf")).toHaveAttribute(
      "src",
      new RegExp(`/api/source-assets/[0-9a-f-]+/preview$`),
    );
    await page.getByRole("button", { name: "关闭预览", exact: true }).click();
    await page.getByRole("button", { name: "暂时跳过，去分析 JD", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/applications/${second.applicationId}\\?tab=jd&setup=1$`));
    await analyzeJD(page, second.detailUrl);
    await page.goto(`${second.detailUrl}?tab=resume`);
    await expect(page.getByRole("heading", { name: "仅职业档案模式" })).toBeVisible();
    if (visualQa) {
      await page.screenshot({ path: "/tmp/job-buddy-profile-only-desktop.png", fullPage: false });
    }
    const secondGapRunsBefore = await account
      .from("resume_gap_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("application_id", second.applicationId);
    if (secondGapRunsBefore.error) throw secondGapRunsBefore.error;
    expect(secondGapRunsBefore.count).toBe(0);

    const assetsBeforeDuplicate = await account
      .from("source_assets")
      .select("id", { count: "exact" })
      .eq("user_id", userId);
    if (assetsBeforeDuplicate.error) throw assetsBeforeDuplicate.error;
    await uploadBaseline(
      page,
      "tests/fixtures/resume-en.pdf",
      new RegExp(`/applications/${second.applicationId}\\?tab=resume$`),
    );
    await expect
      .poll(async () => {
        const reusedBaseline = await account
          .from("applications")
          .select("resume_source_asset_id")
          .eq("id", second.applicationId)
          .single();
        if (reusedBaseline.error) throw reusedBaseline.error;
        return reusedBaseline.data.resume_source_asset_id;
      })
      .toBe(firstAssetId);
    const assetsAfterDuplicate = await account
      .from("source_assets")
      .select("id", { count: "exact" })
      .eq("user_id", userId);
    if (assetsAfterDuplicate.error) throw assetsAfterDuplicate.error;
    expect(assetsAfterDuplicate.count).toBe(assetsBeforeDuplicate.count);

    await page.reload();
    await expect(
      page.getByRole("button", { name: "预览 resume-en.pdf", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "上传新简历", exact: true }).click();

    await uploadBaseline(
      page,
      "tests/fixtures/resume-scanned.pdf",
      new RegExp(`/applications/${second.applicationId}\\?tab=resume$`),
    );
    await expect
      .poll(async () => {
        const selected = await account
          .from("applications")
          .select("resume_source_asset_id")
          .eq("id", second.applicationId)
          .single();
        if (selected.error) throw selected.error;
        return selected.data.resume_source_asset_id;
      })
      .not.toBe(firstAssetId);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "预览 resume-scanned.pdf", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/applications/${second.applicationId}\\?tab=resume$`));
    await expect(page.getByRole("heading", { name: "简历差距结果" })).toBeVisible();
    await expect(page.getByRole("button", { name: "分析简历差距", exact: true })).toBeVisible();
    const firstScannedResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/resume/gaps/analyze") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "分析简历差距", exact: true }).click();
    const firstScannedResponse = await firstScannedResponsePromise;
    const firstScannedBody = await firstScannedResponse.json();
    expect({
      ok: firstScannedResponse.ok(),
      status: firstScannedResponse.status(),
      body: firstScannedBody,
    }).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(firstScannedBody).toEqual(
      expect.objectContaining({ status: "failed", errorCode: "resume-text-too-short" }),
    );
    await expect(page.getByRole("button", { name: "在本机识别扫描版 PDF", exact: true })).toBeVisible();
    const ocrResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/resume/gaps/analyze") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "在本机识别扫描版 PDF", exact: true }).click();
    const ocrResponse = await ocrResponsePromise;
    expect(ocrResponse.ok()).toBe(true);
    const ocrBody = await ocrResponse.json();
    expect(ocrBody).toEqual(
      expect.objectContaining({ status: "succeeded", reused: false }),
    );
    expect(ocrResponse.request().postDataJSON()).toEqual({
      ocrText: expect.stringContaining("理解并推进这份岗位描述中的核心职责"),
    });
    await expect(page.getByText("简历差距结果", { exact: true })).toBeVisible();
    await expect(page.getByText("等待分析", { exact: true })).toHaveCount(0);
    const ocrGapSummary = page.getByLabel("简历差距摘要");
    for (const label of ["简历漏写", "部分覆盖", "缺少证据", "已经覆盖"]) {
      await expect(ocrGapSummary.getByText(label, { exact: true })).toBeVisible();
    }
    if (visualQa) {
      await page.screenshot({ path: "/tmp/job-buddy-replaced-baseline-desktop.png", fullPage: false });
    }
    const coveredDetails = page.locator("details").filter({ hasText: /已经覆盖/ });
    await coveredDetails.locator("summary").click();
    const ocrGapRow = coveredDetails.getByRole("button", { name: /理解并推进这份岗位描述中的核心职责/ });
    await expect(ocrGapRow).toHaveAttribute("aria-expanded", "false");
    const secondApplication = await account
      .from("applications")
      .select("resume_source_asset_id")
      .eq("id", second.applicationId)
      .single();
    if (secondApplication.error || !secondApplication.data.resume_source_asset_id) {
      throw secondApplication.error ?? new Error("application-e2e-second-baseline-not-selected");
    }
    if (secondApplication.data.resume_source_asset_id === firstAssetId) {
      throw new Error("application-e2e-second-baseline-was-not-replaced");
    }
    const firstApplication = await account
      .from("applications")
      .select("resume_source_asset_id")
      .eq("id", first.applicationId)
      .single();
    if (firstApplication.error || firstApplication.data.resume_source_asset_id !== firstAssetId) {
      throw firstApplication.error ?? new Error("application-e2e-first-baseline-changed");
    }

    await page.goto(`${first.detailUrl}?tab=jd`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('a[href="/applications/new"]:visible')).toHaveCount(1);
    const mobileRequirementRow = page.getByRole("button", { name: /理解并推进这份岗位描述中的核心职责/ });
    await mobileRequirementRow.focus();
    await mobileRequirementRow.press("Enter");
    await expect(mobileRequirementRow).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("JD 来源摘录", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (visualQa) {
      await page.screenshot({ path: "/tmp/job-buddy-jd-mobile.png", fullPage: false });
    }
    await page.goto(`${first.detailUrl}?tab=resume`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (visualQa) {
      await page.screenshot({ path: "/tmp/job-buddy-resume-mobile.png", fullPage: false });
    }
    for (const oldText of ["正文预览", "AI 建议", "证据切换", "建议/证据"]) {
      await expect(page.getByText(oldText, { exact: true })).toHaveCount(0);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    const requirements = await account
      .from("application_requirements")
      .select("id")
      .eq("application_id", first.applicationId)
      .limit(1);
    if (requirements.error || !requirements.data[0]) {
      throw requirements.error ?? new Error("resume-version-fixture-requirement-missing");
    }
    const legacy = await createLegacyVersion(account, first.applicationId, factId, requirements.data[0].id);
    await page.goto(`${first.detailUrl}/resume/${legacy.versionId}`);
    await expect(page.getByText("不可变快照", { exact: true })).toBeVisible();
    const docxResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith("/export") && response.url().includes("format=docx"),
    );
    const docxDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载 DOCX", exact: true }).click();
    const [docxResponse, docxDownload] = await Promise.all([docxResponsePromise, docxDownloadPromise]);
    expect(docxResponse.ok()).toBe(true);
    expect(docxDownload.suggestedFilename()).toMatch(/\.docx$/);
    expect(await docxDownload.failure()).toBeNull();
    const pdfResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith("/export") && response.url().includes("format=pdf"),
    );
    const pdfDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载 PDF", exact: true }).click();
    const [pdfResponse, pdfDownload] = await Promise.all([pdfResponsePromise, pdfDownloadPromise]);
    expect(pdfResponse.ok()).toBe(true);
    expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await pdfDownload.failure()).toBeNull();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
