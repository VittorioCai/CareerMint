import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test("create and track a private application workspace with interview question generation", async ({ page }) => {
  test.setTimeout(120_000);
  const expectAIUnavailable = process.env.E2E_EXPECT_AI_UNAVAILABLE === "1";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !publishableKey || !secretKey) {
    throw new Error("application-e2e-supabase-env-missing");
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const account = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `application-workspace-${stamp}@example.com`;
  const password = "CareerMint123!";
  const confirmedFactId = crypto.randomUUID();
  const pendingFactId = crypto.randomUUID();
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
    const signedIn = await account.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;

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

    const consented = await account
      .from("profiles")
      .update({ ai_processing_consent_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (consented.error) throw consented.error;
    const facts = await account.from("career_facts").insert([
      {
        id: confirmedFactId,
        user_id: userId,
        fact_type: "achievement",
        data: {
          title: "Checkout conversion improvement",
          organization: "Acme GmbH",
          startDate: null,
          endDate: null,
          description:
            "Improved checkout conversion by 18% through funnel analysis.",
          skills: ["SQL", "Funnel analysis"],
        },
        source_excerpt:
          "Improved checkout conversion by 18% through funnel analysis.",
        confirmation_status: "confirmed",
        confirmed_at: new Date().toISOString(),
      },
      {
        id: pendingFactId,
        user_id: userId,
        fact_type: "skill",
        data: {
          title: "Unconfirmed Python",
          organization: null,
          startDate: null,
          endDate: null,
          description: "Python experience awaiting confirmation",
          skills: ["Python"],
        },
        source_excerpt: "Python",
        confirmation_status: "pending",
      },
    ]);
    if (facts.error) throw facts.error;

    await page.goto("/applications/new");
    await page.getByLabel("公司").fill("Acme GmbH");
    await page.getByLabel("职位").fill("Product Manager");
    await page.getByLabel("地点").fill("Berlin, Germany");
    await page.getByLabel("办公方式").selectOption("hybrid");
    await page.getByLabel("来源").fill("Company site");
    await page
      .getByLabel("岗位链接")
      .fill("https://example.com/jobs/product-manager");
    const jdText =
      "Lead product discovery, partner with engineering, define strategy, and measure customer outcomes across international markets.";
    await page.getByLabel("JD 原文").fill(jdText);
    await expect(page.getByText("草稿已保存在当前浏览器")).toBeVisible();
    await page.getByRole("button", { name: "建立申请工作区" }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);

    const detailUrl = page.url();
    const applicationId = detailUrl.split("/").pop();
    if (!applicationId) throw new Error("application-e2e-id-missing");
    await expect(page.getByRole("heading", { name: "Product Manager" })).toBeVisible();
    await expect(page.getByText("Acme GmbH", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "面试准备", exact: true }).click();
    await expect(page.getByText(/已自动包含 5 道通用题/)).toBeVisible();
    await expect(page.getByText("Tell me about yourself.")).toBeVisible();
    await page
      .getByLabel("核心问题")
      .fill("How would you prioritize this product roadmap?");
    await page.getByRole("button", { name: "加入题库" }).click();
    await expect(
      page.getByText("问题已加入，通用准备记录可继续复用。"),
    ).toBeVisible();
    const interviewCard = page.locator("article", {
      hasText: "How would you prioritize this product roadmap?",
    });
    await expect(interviewCard.getByText("可能会问")).toBeVisible();
    await interviewCard.getByText("准备回答", { exact: true }).click();
    await interviewCard.getByLabel("准备状态").selectOption("outlined");
    await interviewCard
      .getByLabel("回答提纲")
      .fill("Explain the customer evidence, tradeoff, and measurable result.");
    await interviewCard
      .getByLabel(/Checkout conversion improvement/)
      .check();
    await interviewCard
      .getByRole("button", { name: "保存准备记录" })
      .click();
    await expect(interviewCard.getByText("准备记录已保存。")).toBeVisible();

    if (process.env.E2E_FAKE_EXTRACTOR === "1") {
      const firstPrompt = "How would you lead product discovery for this role?";
      const secondPrompt = "How would you measure customer outcomes in this role?";
      const [bankBefore, commonBefore] = await Promise.all([
        account
          .from("interview_questions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        account
          .from("interview_questions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("category", "common"),
      ]);
      if (bankBefore.error) throw bankBefore.error;
      if (commonBefore.error) throw commonBefore.error;
      expect(bankBefore.count).toBe(6);
      const commonCountBefore = commonBefore.count ?? 0;
      const preparationSection = page
        .locator("section")
        .filter({
          has: page.getByRole("heading", { name: "本岗位准备清单" }),
        })
        .last();
      await expect(
        preparationSection.getByText(firstPrompt, { exact: true }),
      ).toHaveCount(0);
      await expect(
        preparationSection.getByText(secondPrompt, { exact: true }),
      ).toHaveCount(0);

      await page.setViewportSize({ width: 1440, height: 1000 });
      const generationResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(
            `/api/applications/${applicationId}/interview/questions/generate`,
          ) && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "生成岗位增量题", exact: true }).click();
      const generationResponse = await generationResponsePromise;
      expect(generationResponse.ok()).toBe(true);
      const generationBody = (await generationResponse.json()) as {
        runId: string;
        status: string;
        reused: boolean;
      };
      expect(generationBody.status).toBe("succeeded");
      expect(generationBody.reused).toBe(false);
      await expect(
        page.getByText("生成完成，请先预览，再决定是否加入题库。"),
      ).toBeVisible();

      const candidateRegion = page.getByLabel("岗位增量题候选");
      const candidateCards = candidateRegion.locator("article");
      await expect(candidateCards).toHaveCount(2);
      const firstCandidate = candidateCards.nth(0);
      const secondCandidate = candidateCards.nth(1);
      await expect(
        firstCandidate.getByText("岗位特定", { exact: true }),
      ).toBeVisible();
      await expect(
        firstCandidate.getByText("可能会问", { exact: true }),
      ).toBeVisible();
      await expect(
        firstCandidate.getByText(firstPrompt, { exact: true }),
      ).toBeVisible();
      await expect(
        firstCandidate.getByText("JD 依据：", { exact: true }),
      ).toBeVisible();
      await expect(firstCandidate.getByText(jdText, { exact: false })).toBeVisible();
      await expect(
        firstCandidate.getByText("为什么相关：", { exact: true }),
      ).toBeVisible();
      await expect(
        firstCandidate.getByText(
          "This preparation question is grounded in the supplied job description.",
          { exact: false },
        ),
      ).toBeVisible();
      await expect(
        secondCandidate.getByText(secondPrompt, { exact: true }),
      ).toBeVisible();

      await expect(
        preparationSection.getByText(firstPrompt, { exact: true }),
      ).toHaveCount(0);
      await expect(
        preparationSection.getByText(secondPrompt, { exact: true }),
      ).toHaveCount(0);
      const [bankAfterGeneration, candidatesAfterGeneration] = await Promise.all([
        account
          .from("interview_questions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        account
          .from("interview_question_candidates")
          .select("id", { count: "exact", head: true })
          .eq("run_id", generationBody.runId),
      ]);
      if (bankAfterGeneration.error) throw bankAfterGeneration.error;
      if (candidatesAfterGeneration.error) throw candidatesAfterGeneration.error;
      expect(bankAfterGeneration.count).toBe(bankBefore.count);
      expect(candidatesAfterGeneration.count).toBe(2);

      await page.screenshot({
        path: "/tmp/careermint-interview-ai-review.png",
        fullPage: true,
      });

      await firstCandidate
        .getByRole("checkbox", { name: firstPrompt })
        .check();
      await page
        .getByRole("button", { name: "加入所选题库", exact: true })
        .click();
      await expect(page.getByText(/已处理 1 道：新增 1/)).toBeVisible();
      await expect(
        preparationSection.getByText(firstPrompt, { exact: true }),
      ).toBeVisible();
      const acceptedCard = preparationSection
        .locator("article")
        .filter({ hasText: firstPrompt });
      await expect(
        acceptedCard.getByText("AI 建议", { exact: true }),
      ).toBeVisible();
      await expect(
        acceptedCard.getByText("可能会问", { exact: true }),
      ).toBeVisible();
      await expect(
        acceptedCard.getByText("JD 依据：", { exact: true }),
      ).toBeVisible();
      await expect(acceptedCard.getByText(jdText, { exact: false })).toBeVisible();
      const commonAfterAccept = await account
        .from("interview_questions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("category", "common");
      if (commonAfterAccept.error) throw commonAfterAccept.error;
      expect(commonAfterAccept.count).toBe(commonCountBefore);

      await page.reload();
      const reloadedPreparationSection = page
        .locator("section")
        .filter({
          has: page.getByRole("heading", { name: "本岗位准备清单" }),
        })
        .last();
      const reloadedAcceptedCard = reloadedPreparationSection
        .locator("article")
        .filter({ hasText: firstPrompt });
      await expect(reloadedAcceptedCard).toHaveCount(1);
      await expect(
        reloadedAcceptedCard.getByText("AI 建议", { exact: true }),
      ).toBeVisible();
      await expect(
        reloadedAcceptedCard.getByText("可能会问", { exact: true }),
      ).toBeVisible();
      await expect(
        reloadedAcceptedCard.getByText(jdText, { exact: false }),
      ).toBeVisible();

      const reloadedCandidateRegion = page.getByLabel("岗位增量题候选");
      const reloadedSecondCandidate = reloadedCandidateRegion
        .locator("article")
        .nth(1);
      await expect(
        reloadedSecondCandidate.getByText(secondPrompt, { exact: true }),
      ).toBeVisible();
      await reloadedSecondCandidate
        .getByRole("checkbox", { name: secondPrompt })
        .check();
      await page.getByRole("button", { name: "暂不加入", exact: true }).click();
      await expect(
        page.getByText("已跳过 1 道候选题。", { exact: true }),
      ).toBeVisible();
      await expect(
        reloadedSecondCandidate.getByText("已跳过", { exact: true }),
      ).toBeVisible();
      await expect(
        reloadedPreparationSection.getByText(secondPrompt, { exact: true }),
      ).toHaveCount(0);

      const candidateDecisions = await account
        .from("interview_question_candidates")
        .select("prompt,status,question_id,sort_order")
        .eq("run_id", generationBody.runId)
        .order("sort_order");
      if (candidateDecisions.error) throw candidateDecisions.error;
      expect(candidateDecisions.data).toEqual([
        expect.objectContaining({ prompt: firstPrompt, status: "accepted" }),
        expect.objectContaining({
          prompt: secondPrompt,
          status: "rejected",
          question_id: null,
        }),
      ]);

      const reusedResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(
            `/api/applications/${applicationId}/interview/questions/generate`,
          ) && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "生成岗位增量题", exact: true }).click();
      const reusedResponse = await reusedResponsePromise;
      expect(reusedResponse.ok()).toBe(true);
      const reusedBody = (await reusedResponse.json()) as {
        runId: string;
        status: string;
        reused: boolean;
        errorCode: string | null;
      };
      expect(reusedBody).toEqual({
        runId: generationBody.runId,
        status: "succeeded",
        reused: true,
        errorCode: null,
      });
      const generationRuns = await account
        .from("interview_question_generation_runs")
        .select("id,attempt_count", { count: "exact" })
        .eq("user_id", userId)
        .eq("application_id", applicationId);
      if (generationRuns.error) throw generationRuns.error;
      expect(generationRuns.count).toBe(1);
      expect(generationRuns.data).toEqual([
        { id: generationBody.runId, attempt_count: 1 },
      ]);
    }

    await page.goto("/interview");
    await expect(
      page.getByText("How would you prioritize this product roadmap?"),
    ).toBeVisible();
    await expect(
      page.getByText(process.env.E2E_FAKE_EXTRACTOR === "1" ? "7 道核心题" : "6 道核心题"),
    ).toBeVisible();

    await page.goto(detailUrl);
    await page.getByRole("link", { name: "JD", exact: true }).click();
    await expect(page.getByText(/Lead product discovery/)).toBeVisible();
    const runsBefore = await account
      .from("application_analysis_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (runsBefore.error) throw runsBefore.error;
    expect(runsBefore.count).toBe(0);

    await page.getByRole("button", { name: "开始分析 JD" }).click();
    if (expectAIUnavailable) {
      await expect(
        page.getByText("AI 暂未配置，JD 和现有结果都已保留。", {
          exact: true,
        }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText("分析完成，匹配结果已更新。"),
      ).toBeVisible();
      await expect(page.getByLabel("匹配状态：部分匹配")).toBeVisible();
      await expect(
        page.getByText("Checkout conversion improvement"),
      ).toBeVisible();
      await expect(page.getByText("Unconfirmed Python")).toHaveCount(0);

      await page.getByRole("button", { name: "重新检查匹配" }).click();
      await expect(
        page.getByText("已复用相同 JD 与职业事实的分析结果。"),
      ).toBeVisible();
    }
    const [runsAfter, requirementsAfter] = await Promise.all([
      account
        .from("application_analysis_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      account
        .from("application_requirements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);
    if (runsAfter.error) throw runsAfter.error;
    if (requirementsAfter.error) throw requirementsAfter.error;
    expect(runsAfter.count).toBe(1);
    expect(requirementsAfter.count).toBe(expectAIUnavailable ? 0 : 1);

    if (expectAIUnavailable) {
      const failedRun = await account
        .from("application_analysis_runs")
        .select("id")
        .eq("user_id", userId)
        .eq("application_id", applicationId)
        .single();
      if (failedRun.error) throw failedRun.error;
      const claimed = await account.rpc("claim_application_analysis", {
        target_run_id: failedRun.data.id,
      });
      if (claimed.error || !claimed.data) {
        throw claimed.error ?? new Error("production-analysis-test-claim-failed");
      }
      const completed = await account.rpc("complete_application_analysis", {
        target_run_id: failedRun.data.id,
        accepted_requirements: [
          {
            category: "responsibility",
            text: "Lead product discovery",
            sourceExcerpt: "Lead product discovery",
            priority: "core",
            matchStatus: "evidence",
            matchReason: "The confirmed achievement supports product analysis.",
            matchedFactIds: [confirmedFactId],
          },
        ],
        rejected_requirement_count: 0,
        rejected_evidence_count: 0,
        ai_usage: {
          provider: "production-smoke-fixture",
          model: "no-model-call",
          requestId: null,
          usage: {
            inputCacheHitTokens: 0,
            inputCacheMissTokens: 0,
            outputTokens: 0,
          },
          priceScheduleVersion: null,
        },
        estimated_cost: null,
      });
      if (completed.error) throw completed.error;
    }

    await page.goto(`${detailUrl}?tab=resume`);
    const resumeRunsBefore = await account
      .from("resume_generation_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (resumeRunsBefore.error) throw resumeRunsBefore.error;
    expect(resumeRunsBefore.count).toBe(0);
    await page
      .getByRole("button", { name: "生成岗位简历建议" })
      .click();

    if (expectAIUnavailable) {
      await expect(
        page.getByText("AI 暂未配置，现有版本和职业事实都已保留。", {
          exact: true,
        }),
      ).toBeVisible();
      const [resumeRuns, suggestions, versions] = await Promise.all([
        account
          .from("resume_generation_runs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        account
          .from("resume_suggestions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        account
          .from("resume_versions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
      if (resumeRuns.error) throw resumeRuns.error;
      if (suggestions.error) throw suggestions.error;
      if (versions.error) throw versions.error;
      expect(resumeRuns.count).toBe(1);
      expect(suggestions.count).toBe(0);
      expect(versions.count).toBe(0);
    } else {
      await expect(page).toHaveURL(
        /\/applications\/[0-9a-f-]+\/resume\/[0-9a-f-]+$/,
      );
      await expect(
        page.getByRole("heading", { name: "审核岗位简历建议" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "正文预览" }),
      ).toBeVisible();
      await expect(page.getByText("Unconfirmed Python")).toHaveCount(0);
      await page.getByRole("button", { name: "接受", exact: true }).click();
      await expect(page.getByText("已接受").first()).toBeVisible();
      await page.getByRole("button", { name: "保存为新版本" }).click();
      await expect(page).toHaveURL(
        /\/applications\/[0-9a-f-]+\/resume\/[0-9a-f-]+$/,
      );
      await expect(page.getByText("V1", { exact: true })).toBeVisible();
      await expect(page.getByText("不可变快照", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Improved checkout conversion by 18% through funnel analysis.").first(),
      ).toBeVisible();

      await page.goto(`${detailUrl}?tab=resume`);
      await expect(page.getByText("V1", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "继续审核建议 →" }).click();
      await page.getByRole("button", { name: "修改措辞" }).click();
      await page
        .getByRole("textbox", { name: "编辑建议文本" })
        .fill(
          "Improved checkout conversion by 18% using SQL-led funnel analysis.",
        );
      await page.getByRole("button", { name: "保存并接受" }).click();
      await page.getByRole("button", { name: "保存为新版本" }).click();
      await expect(page.getByText("V2", { exact: true })).toBeVisible();

      const docxDownloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "下载 DOCX" }).click();
      const docxDownload = await docxDownloadPromise;
      expect(docxDownload.suggestedFilename()).toBe(
        "acme-gmbh-product-manager-v2.docx",
      );
      expect(await docxDownload.failure()).toBeNull();

      const pdfDownloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "下载 PDF" }).click();
      const pdfDownload = await pdfDownloadPromise;
      expect(pdfDownload.suggestedFilename()).toBe(
        "acme-gmbh-product-manager-v2.pdf",
      );
      expect(await pdfDownload.failure()).toBeNull();

      await page.goto(`${detailUrl}?tab=resume`);
      await page
        .getByRole("button", { name: "按最新资料重新生成" })
        .click();
      await expect(page).toHaveURL(
        /\/applications\/[0-9a-f-]+\/resume\/[0-9a-f-]+$/,
      );
      const [resumeRuns, resumeVersions] = await Promise.all([
        account
          .from("resume_generation_runs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        account
          .from("resume_versions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
      if (resumeRuns.error) throw resumeRuns.error;
      if (resumeVersions.error) throw resumeVersions.error;
      expect(resumeRuns.count).toBe(1);
      expect(resumeVersions.count).toBe(2);
    }

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
