import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test("create and track a private application workspace", async ({ page }) => {
  test.setTimeout(120_000);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error("application-e2e-supabase-env-missing");
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `application-workspace-${stamp}@example.com`;
  const password = "CareerMint123!";
  let userId: string | undefined;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Application Test" },
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("application-e2e-user-not-created");
    }
    userId = created.data.user.id;

    await page.goto("/login");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByLabel("姓名").fill("Application Test");
    await page.getByLabel("目标岗位").fill("Product Manager");
    await page.getByRole("button", { name: "保存求职目标" }).click();
    await page.getByRole("button", { name: "暂时跳过" }).click();
    await page.getByRole("button", { name: "进入工作台" }).click();
    await expect(page).toHaveURL(/\/app/);

    await page.goto("/applications/new");
    await page.getByLabel("公司").fill("Acme GmbH");
    await page.getByLabel("职位").fill("Product Manager");
    await page.getByLabel("地点").fill("Berlin, Germany");
    await page.getByLabel("办公方式").selectOption("hybrid");
    await page.getByLabel("来源").fill("Company site");
    await page
      .getByLabel("岗位链接")
      .fill("https://example.com/jobs/product-manager");
    await page
      .getByLabel("JD 原文")
      .fill(
        "Lead product discovery, partner with engineering, define strategy, and measure customer outcomes across international markets.",
      );
    await expect(page.getByText("草稿已保存在当前浏览器")).toBeVisible();
    await page.getByRole("button", { name: "建立申请工作区" }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);

    const detailUrl = page.url();
    await expect(page.getByRole("heading", { name: "Product Manager" })).toBeVisible();
    await expect(page.getByText("Acme GmbH", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "JD", exact: true }).click();
    await expect(page.getByText(/Lead product discovery/)).toBeVisible();

    await page.goto("/applications");
    await expect(page.getByRole("link", { name: /Acme GmbH/ })).toBeVisible();
    await page.getByRole("link", { name: "表格", exact: true }).click();
    await expect(page.getByRole("columnheader", { name: "公司与职位" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "准备中" })).toBeVisible();

    await page.goto(detailUrl);
    await page.getByLabel("新阶段").selectOption("applied");
    await page.getByLabel("备注（可选）").fill("Submitted on company site");
    await page.getByRole("button", { name: "确认更新阶段" }).click();
    await expect(page.getByText("阶段已更新，时间线已记录。")).toBeVisible();
    await expect(page.getByText("已投递", { exact: true }).first()).toBeVisible();

    await page.getByRole("link", { name: "时间线", exact: true }).click();
    await expect(page.getByText("准备中 → 已投递")).toBeVisible();
    await expect(page.getByText("Submitted on company site")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of ["/applications", detailUrl]) {
      await page.goto(url);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) throw removed.error;
    }
  }
});
