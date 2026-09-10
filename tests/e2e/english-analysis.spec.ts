/**
 * The English interface all the way through an analysis.
 *
 * Every other spec pins `interface_locale` to `zh-CN`, which means the English
 * half of the product was reachable only by reading the dictionary. Three
 * things could only break here:
 *
 *   1. The paste-ready guard. It used to reject any Latin-script direction on
 *      sight, which was a correct proxy for "not Chinese" and a total failure
 *      once the model answers in English: the whole paid run was discarded
 *      with `paste-ready-rewrite-not-allowed`.
 *   2. The output language reaching the cache key. It travels through the
 *      prompt version into `input_hash`, so switching languages has to mark
 *      the stored analysis out of date instead of showing Chinese findings
 *      under English headings.
 *   3. The stored language surviving. The run records `output_locale`, and the
 *      Markdown export takes its headings from the run rather than from
 *      whoever is downloading it.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const password = "CareerMint123!";
const jdText = [
  "We are hiring a Product Analyst.",
  "Use SQL for funnel analysis and communicate findings to business stakeholders.",
  "Build dashboards, explain measurable outcomes, and confirm German C1.",
].join(" ");

const HAN = /\p{Script=Han}/u;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`english-analysis-e2e-${name.toLowerCase()}-missing`);
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
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `english-analysis-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "English Reader" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("english-analysis-e2e-user-not-created");
  }
  return { email, userId: created.data.user.id };
}

/**
 * English is the default, so this spec writes no locale anywhere. It only has
 * to grant AI consent, which the analysis route requires.
 */
async function prepareAccount(
  page: Page,
  account: SupabaseClient,
  email: string,
  userId: string,
) {
  const signedIn = await account.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding|\/app/u);
  await page.goto("/app");
  if (/\/onboarding/u.test(page.url())) {
    await page.getByLabel("Name").fill("English Reader");
    await page.getByLabel("Target role").fill("Product Analyst");
    await page.getByRole("button", { name: "Save job goals" }).click();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.getByRole("button", { name: "Open the job desk" }).click();
  }

  const consented = await account
    .from("profiles")
    .update({ ai_processing_consent_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (consented.error) throw consented.error;
}

test("analyses in English, and a language switch marks that analysis stale", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await prepareAccount(page, account, email, userId);

    await page.goto("/applications/new");
    await page.getByLabel("Company").fill("Example Labs");
    await page.getByLabel("Role").fill("Product Analyst");
    await page.getByLabel("JD text").fill(jdText);
    await page.getByRole("button", { name: "Create the workspace" }).click();
    await expect(page).toHaveURL(
      /\/applications\/[0-9a-f-]+\?tab=resume&setup=1$/u,
    );
    const applicationId = new URL(page.url()).pathname.split("/").pop()!;
    const detailUrl = `/applications/${applicationId}`;

    const fileInput = page.getByLabel("Upload a new PDF or DOCX resume");
    await fileInput.setInputFiles("tests/fixtures/resume-en.pdf");
    // Clicking straight after `setInputFiles` can outrun React committing the
    // change, and the form then answers "Choose a resume first" to someone who
    // just chose one. Wait for the component to have seen the file.
    await expect
      .poll(() => fileInput.evaluate((node: HTMLInputElement) => node.files?.length ?? 0))
      .toBe(1);
    await page.getByRole("button", { name: "Upload and use this resume" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/applications/${applicationId}\\?tab=difference&setup=1$`, "u"),
      { timeout: 60_000 },
    );

    await page.goto(`${detailUrl}?tab=difference`);
    await page.getByRole("button", { name: "Start the analysis" }).click();

    // The run survived the graph validation. Before the paste-ready guard was
    // rewritten this is exactly where an English analysis died, with the
    // control showing "That run did not finish" and nothing below it.
    await expect(
      page.getByRole("heading", { name: "Differences, most severe first" }),
    ).toBeVisible();
    await expect(page.getByTestId(/^difference-issue-/u)).toHaveCount(5);

    // And the findings themselves came back in English, not just the chrome.
    const firstDifference = page.getByTestId(/^difference-issue-/u).first();
    await firstDifference.locator("summary").click();
    await expect(
      firstDifference.getByText("In the resume now", { exact: true }),
    ).toBeVisible();
    // The rows carry the model's own prose alongside the JD and resume
    // excerpts, which are the user's English input either way — so strip the
    // JD before checking that nothing Chinese came back from the provider.
    const findings = (
      await page.getByTestId(/^difference-issue-/u).allInnerTexts()
    )
      .join("\n")
      .replaceAll(jdText, "");
    expect(findings).not.toMatch(HAN);

    await page.getByRole("link", { name: "Read the guidance →" }).click();
    await expect(
      page.getByRole("heading", { name: "Guidance", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId(/^improvement-item-/u)).toHaveCount(4);

    // Switching language cannot serve the English run to a Chinese reader, and
    // cannot show it under Chinese headings either. It goes stale, and the
    // control offers to run it again.
    await page.goto(`${detailUrl}?tab=difference`);
    const languages = page.getByRole("group", { name: "Language" });
    if (!(await languages.isVisible())) {
      // The switch lives in the account menu, which is a closed <details>. A
      // testid because a <summary> is exposed as the disclosure group and its
      // name here is an email address.
      await page.getByTestId("account-menu").click();
    }
    await languages.getByRole("button", { name: "中文" }).click();

    // The English run cannot be served to a Chinese reader — the language is
    // in the input hash through the prompt version — and it must not be shown
    // under Chinese headings either. So it goes stale and the control offers
    // to run it again, rather than offering a first analysis as if none
    // existed.
    await expect(page.getByRole("button", { name: "重新分析" })).toBeVisible();
    await expect(page.getByText("材料已变化，请重新分析")).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
