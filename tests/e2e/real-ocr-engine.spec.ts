import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Exercises the real PaddleOCR + onnxruntime WebAssembly path.
 *
 * Every other OCR test injects `window.__JOB_BUDDY_E2E_OCR__`, so the actual
 * engine — model download, WASM instantiation, worker handoff — has no
 * automated coverage at all. Any change to how those assets are bundled or
 * served would pass lint, typecheck, unit tests, the rest of the e2e suite and
 * the production build, and only break for a real user with a scanned resume.
 *
 * Tagged @real-ocr and excluded from `pnpm test:e2e`: it downloads tens of
 * megabytes from third-party CDNs, so it is too slow and too network-dependent
 * to gate every push. Run it with `pnpm test:e2e:real-ocr` before and after any
 * change to OCR asset loading.
 */

const password = "CareerMint123!";
const jdText = [
  "We are hiring a Product Analyst.",
  "Use SQL for funnel analysis and communicate findings to business stakeholders.",
  "Build dashboards, explain measurable outcomes, and confirm German C1.",
].join(" ");

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`real-ocr-e2e-${name.toLowerCase()}-missing`);
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

async function createUser(admin: SupabaseClient) {
  const email = `real-ocr-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Real OCR Test" },
  });
  if (error || !data.user) throw new Error("real-ocr-e2e-user-create-failed");
  return { email, userId: data.user.id };
}

test("@real-ocr recognizes a scanned resume with the real WebAssembly engine", async ({
  page,
}) => {
  test.setTimeout(420_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  const analyzeBodies: Array<string | null> = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/resume-jd-difference/analyze")
    ) {
      analyzeBodies.push(request.postData());
    }
  });

  const assetRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\.wasm(\?|$)|worker-entry|paddle|onnxruntime|bcebos/u.test(url)) {
      assetRequests.push(url);
    }
  });

  try {
    const signedIn = await account.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    await page.goto("/login");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding|\/app/u);
    if (/\/onboarding/u.test(page.url())) {
      await page.getByLabel("姓名").fill("Real OCR Test");
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

    await page.goto("/applications/new");
    await page.getByLabel("公司").fill("OCR Labs");
    await page.getByLabel("职位").fill("Insights Analyst");
    await page.getByLabel("地点").fill("Berlin, Germany");
    await page.getByLabel("办公方式").selectOption("hybrid");
    await page.getByLabel("来源").fill("Company site");
    await page.getByLabel("岗位链接").fill("https://example.com/jobs/analyst");
    await page.getByLabel("JD 原文").fill(jdText);
    await page.getByRole("button", { name: "建立申请工作区" }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+\?tab=resume&setup=1$/u);

    await page
      .getByLabel("上传新的 PDF 或 DOCX 简历")
      .setInputFiles("tests/fixtures/resume-scanned.pdf");
    await page.getByRole("button", { name: "上传并使用这份简历" }).click();
    await expect(page).toHaveURL(/tab=difference&setup=1$/u);

    await page.getByRole("button", { name: "开始差异分析" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "没到足够的简历文字" }).or(
        page.getByRole("alert").filter({ hasText: "没有读到足够的简历文字" }),
      ),
    ).toBeVisible();

    // The whole point of this spec: no fake engine may be installed.
    expect(
      await page.evaluate(
        () =>
          typeof (window as unknown as Record<string, unknown>)
            .__JOB_BUDDY_E2E_OCR__,
      ),
    ).toBe("undefined");

    await page.getByRole("button", { name: "在本机识别扫描版 PDF" }).click();
    await expect(page.getByRole("heading", { name: "岗位核心判断" })).toBeVisible({
      timeout: 300_000,
    });

    expect(analyzeBodies).toHaveLength(2);
    expect(analyzeBodies[0]).toBeNull();
    const raw = analyzeBodies[1];
    expect(raw).not.toBeNull();
    const ocrText = String(
      (JSON.parse(raw as string) as { ocrText?: unknown }).ocrText ?? "",
    );

    // The fixture renders "ALEX RIVER / PRODUCT ANALYST / Northstar Commerce"
    // as an image. Compare on letters only so spacing and line breaks in the
    // recognised text cannot make this flaky.
    const letters = ocrText.toUpperCase().replace(/[^A-Z0-9]/gu, "");
    expect(ocrText.length).toBeGreaterThan(200);
    expect(letters).toContain("ALEXRIVER");
    expect(letters).toContain("PRODUCTANALYST");
    expect(letters).toContain("NORTHSTAR");

    // Proves the engine's assets actually travelled over the network.
    expect(assetRequests.length).toBeGreaterThan(0);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
