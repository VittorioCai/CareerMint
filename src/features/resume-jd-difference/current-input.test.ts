// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { ConfirmedFactForAnalysis } from "@/features/career-profile/confirmed-facts";

import {
  currentDifferenceInputs,
  differenceProviderConfiguration,
  FAKE_DIFFERENCE_MODEL,
} from "./current-input";
import { buildDifferenceFingerprints } from "./hashes";
import {
  differencePrompt,
  RESUME_JD_DIFFERENCE_POLICY_VERSION,
  RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
} from "./prompts";
import type { ResumeJDDifferenceRun } from "./repository";

const applicationId = "11111111-1111-4111-8111-111111111111";
const fact: ConfirmedFactForAnalysis = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  factType: "work_experience",
  title: "Data Analyst Intern",
  organization: "Example",
  description: "Built recurring reports with SQL.",
  skills: ["SQL"],
  sourceExcerpt: "Built recurring reports with SQL",
};
const inputs = {
  applicationId,
  jdText: "Analyze customer funnels with SQL.",
  sourceSha256: "a".repeat(64),
  confirmedFacts: [fact],
  locale: "zh-CN" as const,
};

/** What an analysis of `inputs` hashes to, under the environment below. */
function fingerprints(resumeTextSha256: string | null = null) {
  return buildDifferenceFingerprints({
    applicationId: inputs.applicationId,
    jdText: inputs.jdText,
    sourceSha256: inputs.sourceSha256,
    confirmedFacts: inputs.confirmedFacts,
    resumeTextSha256,
    provider: "deepseek",
    model: "deepseek-flash",
    promptVersion: differencePrompt("p1", "zh-CN").version,
    schemaVersion: RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
    policyVersion: RESUME_JD_DIFFERENCE_POLICY_VERSION,
  });
}

function run(
  overrides: Pick<ResumeJDDifferenceRun, "inputHash"> &
    Partial<Pick<ResumeJDDifferenceRun, "resumeTextSource" | "resumeTextSha256">>,
) {
  return {
    resumeTextSource: "file",
    resumeTextSha256: null,
    ...overrides,
  } as ResumeJDDifferenceRun;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
  vi.stubEnv("AI_TEXT_PROVIDER", "deepseek");
  vi.stubEnv("AI_TEXT_MODEL", "deepseek-flash");
  vi.stubEnv("RESUME_JD_DIFFERENCE_PROMPT_VARIANT", "p1");
  vi.stubEnv("E2E_FAKE_EXTRACTOR", "0");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("whether a stored run is current", () => {
  it("recognises a run made from the same inputs", () => {
    const matches = currentDifferenceInputs(inputs);

    expect(matches(run({ inputHash: fingerprints().inputHash }))).toBe(true);
  });

  it("recognises a run made before the application joined the key", () => {
    // Otherwise every analysis stored so far turns stale at once, under a
    // notice that the material changed. It did not.
    const matches = currentDifferenceInputs(inputs);

    expect(matches(run({ inputHash: fingerprints().legacyInputHash! }))).toBe(
      true,
    );
  });

  it("recognises a run made from supplied text by that text", () => {
    const textSha = "9".repeat(64);
    const matches = currentDifferenceInputs(inputs);

    // The page has the file's hash and not the text. Only the run knows which
    // text it analysed, so the question is asked with the run's own.
    expect(
      matches(
        run({
          inputHash: fingerprints(textSha).inputHash,
          resumeTextSource: "ocr",
          resumeTextSha256: textSha,
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["the JD", { jdText: "Analyze product retention with SQL." }],
    ["the resume file", { sourceSha256: "b".repeat(64) }],
    ["a confirmed fact", { confirmedFacts: [{ ...fact, description: "Changed." }] }],
    ["the reader's language", { locale: "en" as const }],
    ["the application", { applicationId: "22222222-2222-4222-8222-222222222222" }],
  ])("calls a run stale once %s has changed", (_label, change) => {
    const stored = run({ inputHash: fingerprints().inputHash });

    expect(currentDifferenceInputs({ ...inputs, ...change })(stored)).toBe(
      false,
    );
  });

  it("calls a run from supplied text stale once the JD has changed", () => {
    const textSha = "9".repeat(64);
    const stored = run({
      inputHash: fingerprints(textSha).inputHash,
      resumeTextSource: "paste",
      resumeTextSha256: textSha,
    });

    expect(
      currentDifferenceInputs({ ...inputs, jdText: "Another job." })(stored),
    ).toBe(false);
  });
});

describe("the provider an analysis runs under", () => {
  it("is the configured one", () => {
    expect(differenceProviderConfiguration()).toEqual({
      provider: "deepseek",
      model: "deepseek-flash",
    });
  });

  it("is the fake outside production when the suite asks for it", () => {
    vi.stubEnv("E2E_FAKE_EXTRACTOR", "1");
    vi.stubEnv("NODE_ENV", "test");

    expect(differenceProviderConfiguration().model).toBe(FAKE_DIFFERENCE_MODEL);
  });

  it("is never the fake in production, whatever the flag says", () => {
    vi.stubEnv("E2E_FAKE_EXTRACTOR", "1");
    vi.stubEnv("NODE_ENV", "production");

    expect(differenceProviderConfiguration()).toEqual({
      provider: "deepseek",
      model: "deepseek-flash",
    });
  });
});
