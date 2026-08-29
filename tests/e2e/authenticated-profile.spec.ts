import { readFile } from "node:fs/promises";

import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import JSZip from "jszip";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

async function latestEmail(
  request: APIRequestContext,
  recipient: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get(
      "http://127.0.0.1:54324/api/v1/messages",
    );
    const body = (await response.json()) as {
      messages?: Array<Record<string, unknown>>;
    };
    const message = body.messages?.find((candidate) =>
      JSON.stringify(candidate).includes(recipient),
    );
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("reset-email-not-found");
}

async function recoveryLink(
  request: APIRequestContext,
  recipient: string,
) {
  const summary = await latestEmail(request, recipient);
  const id = String(summary.ID ?? summary.Id ?? summary.id ?? "");
  const response = await request.get(
    `http://127.0.0.1:54324/api/v1/message/${id}`,
  );
  const message = await response.text();
  const candidates = message.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const link = candidates
    .map((candidate) =>
      candidate.replaceAll("&amp;", "&").replaceAll("\\u0026", "&"),
    )
    .find(
      (candidate) =>
        candidate.includes("type=recovery") ||
        candidate.includes("/auth/v1/verify"),
    );
  if (!link) throw new Error("reset-link-not-found");
  return link.replace(/[),.;]+$/, "");
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}

async function confirmFact(article: Locator) {
  await article.getByRole("button", { name: "确认真实" }).click();
  const dialog = article.getByRole("dialog", { name: "确认职业事实" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "确认并保存" }).click();
  await expect(article.getByText("已确认")).toBeVisible();
}

async function createAccountAndReachOnboarding(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  admin: SupabaseClient,
) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `career-mint-ocr-${stamp}@example.com`;
  const initialPassword = "CareerMint123!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("e2e-user-create-failed");

  await context.clearCookies();
  await login(page, email, initialPassword);
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "上传简历" })).toBeVisible();

  await page.getByLabel("姓名").fill("Alex River");
  await page.getByLabel("目标岗位").fill("Product Analyst");
  await page.getByLabel("目标国家").fill("Germany, Netherlands");
  await page.getByRole("button", { name: "保存求职目标" }).click();
  await expect(page.getByLabel("上传现有简历")).toBeVisible();
  return data.user.id;
}

test("complete private career-profile foundation flow", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `career-mint-${stamp}@example.com`;
  const initialPassword = "CareerMint123!";
  const newPassword = "CareerMint456!";

  for (const path of [
    "/app",
    "/applications",
    "/profile",
    "/interview",
    "/onboarding",
    "/settings/account",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  }

  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(initialPassword);
  await page.getByRole("button", { name: "注册新账户" }).click();
  await expect(page.getByText("请检查邮箱并完成确认")).toBeVisible();

  await context.clearCookies();
  await page.goto("/forgot-password");
  await page.getByLabel("账户邮箱").fill(email);
  await page.getByRole("button", { name: "发送重设链接" }).click();
  await expect(
    page.getByText("如果该邮箱存在，我们已发送重设链接"),
  ).toBeVisible();

  await page.goto(await recoveryLink(request, email));
  await expect(page).toHaveURL(/\/reset-password/);
  await page.getByLabel("新密码", { exact: true }).fill(newPassword);
  await page.getByLabel("再次输入新密码").fill(newPassword);
  await page
    .getByRole("button", { name: "更新密码并进入工作台" })
    .click();
  await expect(page).toHaveURL(/\/onboarding/);

  await context.clearCookies();
  await login(page, email, newPassword);
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "求职目标" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "上传简历" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "核对事实" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByLabel("姓名").fill("Lin Chen");
  await page.getByLabel("目标岗位").fill("Product Analyst");
  await page.getByLabel("目标国家").fill("Germany, Netherlands");
  await page.getByRole("button", { name: "保存求职目标" }).click();
  await page
    .getByLabel("上传现有简历")
    .setInputFiles("tests/fixtures/resume-en.pdf");
  await page.getByRole("button", { name: "上传并开始建档" }).click();
  await expect(
    page.getByText(/文件已保存在你的私有空间/),
  ).toBeVisible();
  await page
    .getByLabel("允许系统将提取后的简历文字发送给 AI 服务进行分析")
    .check();
  await page.getByRole("button", { name: "授权后重试" }).click();
  await expect(page.getByText("简历分析完成")).toBeVisible();
  await page.getByRole("button", { name: "继续核对事实" }).click();
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page).toHaveURL(/\/app/);

  for (const label of ["首页", "我的投递", "职业档案", "面试题库"]) {
    await expect(page.getByRole("link", { name: label }).first()).toBeVisible();
  }
  const sidebarColor = await page
    .locator("aside[aria-label='主导航']")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const ctaColor = await page
    .locator("aside a[href='/applications/new']")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(sidebarColor).toBe("rgb(189, 235, 215)");
  expect(ctaColor).toBe("rgb(255, 242, 168)");

  await page.goto("/applications");
  await expect(
    page.getByRole("heading", { name: "我的投递" }),
  ).toBeVisible();
  await expect(page.getByText("还没有投递记录")).toBeVisible();
  await page.goto("/interview");
  await expect(page.getByRole("heading", { name: "面试题库" })).toBeVisible();
  await expect(page.getByText("5 道核心题")).toBeVisible();
  await expect(page.getByText("Tell me about yourself.")).toBeVisible();

  await page.goto("/profile");
  const achievement = page.locator("article", { hasText: "18%" });
  await confirmFact(achievement);

  await page.getByRole("button", { name: "＋ 手动添加事实" }).click();
  await page.getByLabel("类型").selectOption("skill");
  await page.getByLabel("技能名称").fill("SQL");
  await page.getByLabel("熟练程度或使用场景").fill("Advanced SQL analysis");
  await page.getByRole("button", { name: "保存为待确认" }).click();
  const manualSkill = page.locator("article", { hasText: "Advanced SQL analysis" });
  await expect(manualSkill).toBeVisible();
  await confirmFact(manualSkill);

  await page.reload();
  await expect(page.locator("article", { hasText: "18%" }).getByText("已确认")).toBeVisible();
  await expect(page.locator("article", { hasText: "Advanced SQL analysis" }).getByText("已确认")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  for (const label of ["首页", "我的投递", "职业档案", "面试题库"]) {
    await expect(page.getByRole("link", { name: label }).first()).toBeAttached();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/settings/account");
  const emailField = page.getByLabel("登录邮箱（已验证）");
  await expect(emailField).toHaveValue(email);
  await expect(emailField).toHaveAttribute("readonly", "");
  await page.getByLabel("目标岗位").fill("Senior Product Analyst");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("账户偏好已保存")).toBeVisible();

  await page.goto("/settings/privacy");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载全部数据" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("export-download-missing");
  const zip = await JSZip.loadAsync(await readFile(downloadPath));
  expect(zip.file("profile.json")).not.toBeNull();
  expect(zip.file("interview-preparation.json")).not.toBeNull();
  expect(
    Object.keys(zip.files).some(
      (path) => /^files\/[0-9a-f-]+\/resume-en\.pdf$/.test(path),
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "删除我的账户" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "确认删除账户" });
  await deleteDialog.getByLabel("确认文字").fill("DELETE");
  await deleteDialog.getByRole("button", { name: "永久删除账户" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3000/");
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("@real-ocr local OCR browser smoke stays lazy and recovers scanned resumes", async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !secretKey) throw new Error("supabase-admin-env-missing");
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const createdUserIds: string[] = [];

  const modelRequests: string[] = [];
  const sourceUploads: string[] = [];
  const extractionPosts: Array<{ url: string; body: string | null }> = [];
  const extractionResponses: Array<{ status: number; body: string }> = [];
  const browserDiagnostics: string[] = [];
  const summarize = (value: string) => value.replace(/\s+/g, " ").slice(0, 300);
  const summarizeUrl = (value: string) => {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  };
  page.on("request", (requestEvent) => {
    const url = requestEvent.url();
    if (/paddle-model-ecology|onnxruntime-web|PP-OCR|\.onnx/i.test(url)) {
      modelRequests.push(url);
    }
    if (requestEvent.method() !== "POST") return;
    if (/\/api\/source-assets$/.test(new URL(url).pathname)) {
      sourceUploads.push(url);
    }
    if (/\/api\/source-assets\/[^/]+\/extract$/.test(new URL(url).pathname)) {
      extractionPosts.push({ url, body: requestEvent.postData() });
    }
  });
  page.on("response", async (responseEvent) => {
    const url = responseEvent.url();
    if (
      responseEvent.status() >= 400 &&
      /paddle-model|onnxruntime|PP-OCR|pdf\.worker|pdf\.mjs/i.test(url)
    ) {
      browserDiagnostics.push(
        `resource-response: ${summarizeUrl(url)} status=${responseEvent.status()}`,
      );
    }
    if (!/\/api\/source-assets\/[^/]+\/extract$/.test(new URL(url).pathname)) {
      return;
    }
    let body = "<response-body-unavailable>";
    try {
      body = await responseEvent.text();
    } catch {
      // Keep a diagnostic marker so a missing response body is still reported.
    }
    extractionResponses.push({ status: responseEvent.status(), body });
  });
  page.on("pageerror", (error) => {
    browserDiagnostics.push(`pageerror: ${summarize(error.message)}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserDiagnostics.push(`${message.type()}: ${summarize(message.text())}`);
    }
  });
  page.on("requestfailed", (requestEvent) => {
    const failure = requestEvent.failure()?.errorText ?? "unknown-request-failure";
    browserDiagnostics.push(
      `requestfailed: ${summarizeUrl(requestEvent.url())} ${summarize(failure)}`,
    );
  });

  try {
    // The ordinary text-PDF path must finish without importing PaddleOCR or
    // requesting its model assets. This also proves the default E2E path keeps
    // OCR entirely out of the browser until the native parser reports too-short.
    createdUserIds.push(await createAccountAndReachOnboarding(page, context, admin));
    await page
      .getByLabel("上传现有简历")
      .setInputFiles("tests/fixtures/resume-en.pdf");
    await page.getByRole("button", { name: "上传并开始建档" }).click();
    await expect(page.getByText(/文件已保存在你的私有空间/)).toBeVisible();
    expect(modelRequests).toEqual([]);
    // Use a fresh account because onboarding intentionally disables re-upload
    // after the first source is saved. The second account exercises the real
    // scanned-PDF fallback and its idempotent OCR submission.
    modelRequests.length = 0;
    sourceUploads.length = 0;
    extractionPosts.length = 0;
    extractionResponses.length = 0;
    createdUserIds.push(await createAccountAndReachOnboarding(page, context, admin));
    await page
      .getByLabel("允许系统将提取后的简历文字发送给 AI 服务进行分析")
      .check();

    await page.evaluate(() => {
      const snapshots: string[] = [];
      (window as Window & { __ocrSnapshots?: string[] }).__ocrSnapshots = snapshots;
      window.setInterval(() => {
        const text = document.body?.innerText ?? "";
        if (text.includes("正在本地识别扫描版简历")) snapshots.push(text);
      }, 20);
    });

    await page
      .getByLabel("上传现有简历")
      .setInputFiles("tests/fixtures/resume-scanned.pdf");
    await page.getByRole("button", { name: "上传并开始建档" }).click();
    await expect
      .poll(
        () => extractionResponses.map(({ status, body }) => `${status}: ${body}`).join("\n"),
        { timeout: 30_000 },
      )
      .toMatch(/"errorCode"\s*:\s*"resume-text-too-short"/);
    await expect(page.getByRole("button", { name: "取消本地识别" })).toBeVisible({
      timeout: 120_000,
    });

    await page.getByRole("button", { name: "取消本地识别" }).click();
    await expect(page.getByText("已取消本地识别，可重新尝试。")).toBeVisible();
    expect(sourceUploads).toHaveLength(1);
    expect(
      extractionPosts.filter(({ body }) => body?.includes('"ocrText"')),
    ).toHaveLength(0);

    await page.getByRole("button", { name: "重新尝试" }).click();
    await expect.poll(() => sourceUploads.length, { timeout: 30_000 }).toBe(1);
    await expect(page.getByText("已取消本地识别，可重新尝试。")).toBeHidden({
      timeout: 5_000,
    });
    const completion = page
      .getByText("简历分析完成")
      .waitFor({ state: "visible", timeout: 240_000 })
      .then(() => "succeeded" as const);
    const ocrFailure = page
      .getByText("本地识别暂时不可用，请重试或上传文字版简历。", { exact: true })
      .waitFor({ state: "visible", timeout: 240_000 })
      .then(() => {
        throw new Error(
          `browser OCR failed: resume-ocr-unavailable; diagnostics=${browserDiagnostics.join(" | ")}`,
        );
      });
    await Promise.race([completion, ocrFailure]);

    const ocrPosts = extractionPosts.filter(({ body }) => body?.includes('"ocrText"'));
    expect(ocrPosts).toHaveLength(1);
    expect(modelRequests.length).toBeGreaterThan(0);
    expect(modelRequests.some((url) => /paddle-model-ecology|PP-OCR/i.test(url))).toBe(true);
    const snapshots = await page.evaluate(
      () => (window as Window & { __ocrSnapshots?: string[] }).__ocrSnapshots ?? [],
    );
    expect(snapshots.some((text) => text.includes("正在本地识别扫描版简历（第 2/2 页）"))).toBe(true);

    await page.getByRole("button", { name: "继续核对事实" }).click();
    await page.getByRole("button", { name: "进入工作台" }).click();
    await expect(page).toHaveURL(/\/app/);
  } finally {
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
});
