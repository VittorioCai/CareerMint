import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  declaredOutputCap,
  runResumeJDDifferenceEvaluationCli,
  usageFromEnvelope,
} from "../../../scripts/evaluate-resume-jd-difference-prompts";

import fixture01 from "../../../tests/fixtures/resume-jd-difference-eval/01-en-synonym-alignment.json";
import fixture02 from "../../../tests/fixtures/resume-jd-difference-eval/02-de-strict-gates.json";
import fixture03 from "../../../tests/fixtures/resume-jd-difference-eval/03-en-skill-only.json";
import fixture04 from "../../../tests/fixtures/resume-jd-difference-eval/04-de-profile-only.json";
import fixture05 from "../../../tests/fixtures/resume-jd-difference-eval/05-en-unsupported.json";
import fixture06 from "../../../tests/fixtures/resume-jd-difference-eval/06-en-missing-context-result.json";

import {
  RESUME_JD_DIFFERENCE_EVAL_MAX_CALLS,
  RESUME_JD_DIFFERENCE_EVAL_MAX_COST_USD,
  RESUME_JD_DIFFERENCE_EVAL_MAX_OUTPUT_TOKENS,
  createDifferenceEvaluationBudgetLedger,
  differenceEvaluationFixtureSchema,
  evaluateDifferenceCase,
  isEligibleDifferencePrompt,
  RESUME_JD_DIFFERENCE_EVAL_MIN_ISSUE_RECALL,
  selectDifferencePromptWinner,
  type DifferencePromptCandidateSummary,
} from "./evaluation";
import type { ResumeJDDifferenceOutput } from "./schemas";

const fixtures = [fixture01, fixture02, fixture03, fixture04, fixture05, fixture06];

const output: ResumeJDDifferenceOutput = {
  jobCore: {
    mission: "用可信的数据报告支持业务决策。",
    coreCapabilities: ["数据分析", "报告", "业务协作"],
    concepts: [
      {
        id: "concept-1",
        label: "利益相关方沟通",
        originalTerms: ["stakeholder management"],
        importanceReason: "职责与要求均强调。",
        priority: "critical",
      },
      {
        id: "concept-2",
        label: "A/B 测试",
        originalTerms: ["A/B testing"],
        importanceReason: "核心分析方法。",
        priority: "important",
      },
    ],
    gates: [],
    preferredItems: [],
  },
  overallDifference: {
    summary: "简历有业务报告经历，但没有 A/B 测试证据。",
    topIssueIds: ["issue-1"],
  },
  issues: [
    {
      id: "issue-1",
      conceptId: "concept-2",
      jdOriginal: "Experience with A/B testing",
      jdTranslation: "具备 A/B 测试经验",
      resumeExcerpt: null,
      resumeStatus: "当前材料未找到相关证据",
      profileFactIds: [],
      type: "missing",
      problem: "简历未体现 A/B 测试。",
      reason: "简历中没有该方法的可回查表述。",
      priority: "important",
      isGate: false,
      authenticity: "unsupported",
    },
  ],
  matched: [
    {
      id: "matched-1",
      conceptId: "concept-1",
      jdOriginal: "stakeholder management",
      jdTranslation: "利益相关方管理",
      resumeExcerpt: "Worked with business teams to align weekly reporting needs.",
      profileFactIds: [],
      reason: "职责语义一致，并有原文证据。",
    },
  ],
  directions: [
    {
      id: "direction-1",
      issueId: "issue-1",
      targetSection: "experience",
      targetExperience: null,
      conceptId: "concept-2",
      jdTerms: [],
      focusAreas: ["method", "context", "result"],
      synonymousJobLanguage: [],
      authenticity: "unsupported",
      needsConfirmation: true,
      direction: "先确认是否真实做过实验设计、指标选择和结果评估；未做过则不要加入。",
    },
  ],
};

const syntheticFixture = differenceEvaluationFixtureSchema.parse({
  caseId: "synthetic-alignment",
  jdText:
    "We need stakeholder management and experience with A/B testing for commercial decisions.",
  resumeText:
    "Worked with business teams to align weekly reporting needs.",
  confirmedFacts: [],
  expected: {
    issues: [
      {
        label: "missing-ab-test",
        jdNeedles: ["A/B testing"],
        type: "missing",
        priority: "important",
        authenticity: "unsupported",
        isGate: false,
      },
    ],
    matched: [
      {
        label: "stakeholder-language-alignment",
        jdNeedles: ["stakeholder management"],
      },
    ],
  },
});

describe("resume JD difference evaluation", () => {
  it("scores recall, classifications, links, and grounded evidence", () => {
    expect(evaluateDifferenceCase(syntheticFixture, output)).toMatchObject({
      schemaValid: true,
      coreIssueRecall: 1,
      matchedRecall: 1,
      falseSemanticAlignmentCount: 0,
      unsupportedFalsePositiveCount: 0,
      typeAccuracy: 1,
      priorityAccuracy: 1,
      directionLinkRate: 1,
      pasteReadyRewriteCount: 0,
      fabricatedFactCount: 0,
      hardGateFailures: [],
    });
  });

  it("disqualifies invalid schema, fabricated excerpts, and paste-ready rewrites", () => {
    expect(evaluateDifferenceCase(syntheticFixture, { nope: true })).toMatchObject({
      schemaValid: false,
      hardGateFailures: ["schema-invalid"],
    });

    const fabricated = structuredClone(output);
    fabricated.matched[0]!.resumeExcerpt = "Led enterprise stakeholder transformation.";
    expect(evaluateDifferenceCase(syntheticFixture, fabricated)).toMatchObject({
      fabricatedFactCount: 1,
      hardGateFailures: expect.arrayContaining(["fabricated-fact"]),
    });

    const rewrite = structuredClone(output);
    rewrite.directions[0]!.direction =
      "Led A/B testing programs and delivered measurable commercial growth.";
    expect(evaluateDifferenceCase(syntheticFixture, rewrite)).toMatchObject({
      pasteReadyRewriteCount: 1,
      hardGateFailures: expect.arrayContaining(["paste-ready-rewrite"]),
    });
  });

  it("counts a missing requirement presented as matched as false alignment", () => {
    const falseAlignment = structuredClone(output);
    const missing = falseAlignment.issues.pop()!;
    falseAlignment.directions = [];
    falseAlignment.overallDifference.topIssueIds = ["issue-2"];
    falseAlignment.issues.push({
      ...missing,
      id: "issue-2",
      jdOriginal: "another requirement",
    });
    falseAlignment.matched.push({
      id: "matched-2",
      conceptId: "concept-2",
      jdOriginal: "Experience with A/B testing",
      jdTranslation: "具备 A/B 测试经验",
      resumeExcerpt: "Worked with business teams to align weekly reporting needs.",
      profileFactIds: [],
      reason: "错误地把一般协作当作实验经验。",
    });

    expect(evaluateDifferenceCase(syntheticFixture, falseAlignment)).toMatchObject({
      coreIssueRecall: 0,
      falseSemanticAlignmentCount: 1,
      unsupportedFalsePositiveCount: 1,
    });
  });
});

describe("resume JD difference prompt selection and budget", () => {
  function summary(
    variant: "p1" | "p2" | "p3",
    overrides: Partial<DifferencePromptCandidateSummary> = {},
  ): DifferencePromptCandidateSummary {
    return {
      variant,
      promptVersion: `prompt-${variant}`,
      schemaValidRate: 1,
      hardGateFailures: [],
      coreIssueRecall: 1,
      matchedRecall: 1,
      falseSemanticAlignmentCount: 0,
      unsupportedFalsePositiveCount: 0,
      typeAccuracy: 1,
      priorityAccuracy: 1,
      directionLinkRate: 1,
      pasteReadyRewriteCount: 0,
      fabricatedFactCount: 0,
      totalTokens: 100,
      costUsd: 0.001,
      latencyMs: 100,
      ...overrides,
    };
  }

  it("only considers schema-safe, non-fabricating candidates", () => {
    expect(
      selectDifferencePromptWinner([
        summary("p1", { coreIssueRecall: 1 }),
        summary("p2", { pasteReadyRewriteCount: 1 }),
        summary("p3", { fabricatedFactCount: 1 }),
      ]).variant,
    ).toBe("p1");
    expect(() =>
      selectDifferencePromptWinner([
        summary("p1", { schemaValidRate: 0.99 }),
        summary("p2", { pasteReadyRewriteCount: 1 }),
        summary("p3", { fabricatedFactCount: 1 }),
      ]),
    ).toThrow("resume-jd-difference-eval-no-eligible-prompt");
  });

  it("refuses a field in which the best prompt is still not good enough", () => {
    // Ranking alone always has a first place. Before there was a floor, a
    // prompt that found one issue in five won if the others found fewer, and
    // the command exited 0.
    expect(() =>
      selectDifferencePromptWinner([
        summary("p1", { coreIssueRecall: 0.2 }),
        summary("p2", { coreIssueRecall: 0.1 }),
      ]),
    ).toThrow("resume-jd-difference-eval-no-eligible-prompt");

    expect(RESUME_JD_DIFFERENCE_EVAL_MIN_ISSUE_RECALL).toBe(0.8);
    expect(isEligibleDifferencePrompt(summary("p1", { coreIssueRecall: 0.8 }))).toBe(true);
    expect(isEligibleDifferencePrompt(summary("p1", { coreIssueRecall: 0.79 }))).toBe(false);
  });

  it("never chooses a prompt that called an unsupported requirement supported", () => {
    // The product's own promise, so the tolerance is zero: one such finding
    // outweighs a perfect score on everything else.
    expect(
      selectDifferencePromptWinner([
        summary("p1", { unsupportedFalsePositiveCount: 1 }),
        summary("p2", { coreIssueRecall: 0.8, typeAccuracy: 0.5 }),
      ]).variant,
    ).toBe("p2");
  });

  it("prefers fewer false alignments before recall and cost", () => {
    expect(
      selectDifferencePromptWinner([
        summary("p1", { falseSemanticAlignmentCount: 1, totalTokens: 40 }),
        summary("p2", { coreIssueRecall: 0.8, totalTokens: 100 }),
      ]).variant,
    ).toBe("p2");
  });

  it("enforces the approved 18-call, USD 1, 4096-token ceiling", () => {
    expect(RESUME_JD_DIFFERENCE_EVAL_MAX_CALLS).toBe(18);
    expect(RESUME_JD_DIFFERENCE_EVAL_MAX_COST_USD).toBe(1);
    expect(RESUME_JD_DIFFERENCE_EVAL_MAX_OUTPUT_TOKENS).toBe(4096);
    const ledger = createDifferenceEvaluationBudgetLedger({
      inputCacheMissPerMillion: 0,
      outputPerMillion: 0,
    });
    for (let index = 0; index < 18; index += 1) {
      ledger.reserve({ requestBytes: 100 });
    }
    expect(() => ledger.reserve({ requestBytes: 100 })).toThrow(
      "resume-jd-difference-eval-call-cap-exceeded",
    );
  });

  it("dry-runs without credentials or provider calls and prints the full cap", async () => {
    const messages: string[] = [];
    let providerConstructed = false;
    const exitCode = await runResumeJDDifferenceEvaluationCli({
      argv: ["--dry-run", "--prompts=p1,p2,p3", "--max-cost-usd=1"],
      cwd: process.cwd(),
      env: {},
      loadEnvironment: () => undefined,
      createProvider: () => {
        providerConstructed = true;
        throw new Error("provider-must-not-be-constructed");
      },
      writeOutput: (message) => messages.push(message),
    });

    expect(exitCode).toBe(0);
    expect(providerConstructed).toBe(false);
    expect(messages[0]).toContain(
      "fixtures=6 prompts=p1,p2,p3 locale=zh-CN max_calls=18 max_cost_usd=1.000000 max_output_tokens=4096",
    );
    expect(messages.join("\n")).toContain("01-en-synonym-alignment");
    expect(messages.join("\n")).toContain("06-en-missing-context-result");
  });

  it("rejects a budget above the approved one-dollar ceiling", async () => {
    await expect(
      runResumeJDDifferenceEvaluationCli({
        argv: ["--dry-run", "--max-cost-usd=1.01"],
        cwd: process.cwd(),
        env: {},
        loadEnvironment: () => undefined,
        writeOutput: () => undefined,
      }),
    ).rejects.toThrow("resume-jd-difference-eval-cost-cap-invalid");
  });
});

describe("what the harness reads off a request and a response", () => {
  it("finds the output ceiling under either endpoint's name for it", () => {
    expect(declaredOutputCap({ max_tokens: 4096 })).toBe(4096);
    // What /responses sends. The harness looked for the other name only, so
    // it refused every real call it was ever asked to make.
    expect(declaredOutputCap({ max_output_tokens: 4096 })).toBe(4096);
  });

  it.each([
    ["no ceiling", {}],
    ["two ceilings", { max_tokens: 4096, max_output_tokens: 4096 }],
    ["a ceiling that is not a number", { max_output_tokens: "4096" }],
    ["no body", null],
  ])("has no answer for a request with %s", (_label, body) => {
    expect(declaredOutputCap(body)).toBeNull();
  });

  it("reads usage as /responses reports it", () => {
    expect(
      usageFromEnvelope({
        usage: {
          input_tokens: 1200,
          input_tokens_details: { cached_tokens: 200 },
          output_tokens: 300,
        },
      }),
    ).toEqual({
      inputCacheHitTokens: 200,
      inputCacheMissTokens: 1000,
      outputTokens: 300,
    });
    expect(
      usageFromEnvelope({ usage: { input_tokens: 50, output_tokens: 7 } }),
    ).toEqual({
      inputCacheHitTokens: 0,
      inputCacheMissTokens: 50,
      outputTokens: 7,
    });
  });

  it("still reads usage as chat completions report it", () => {
    expect(
      usageFromEnvelope({
        usage: {
          prompt_cache_hit_tokens: 10,
          prompt_cache_miss_tokens: 90,
          completion_tokens: 40,
        },
      }),
    ).toEqual({
      inputCacheHitTokens: 10,
      inputCacheMissTokens: 90,
      outputTokens: 40,
    });
  });

  it("has no usage for a response that reports none", () => {
    expect(usageFromEnvelope({})).toBeNull();
    expect(usageFromEnvelope(null)).toBeNull();
  });
});

describe("a run that is not dry", () => {
  const schedule = JSON.stringify({
    version: "test-schedule",
    provider: "deepseek",
    model: "deepseek-flash",
    currency: "USD",
    observedAt: "2026-09-01T00:00:00.000Z",
    sourceUrl: "https://example.com/pricing",
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveUntil: null,
    defaultRates: {
      inputCacheHitPerMillion: 0.003,
      inputCacheMissPerMillion: 0.15,
      outputPerMillion: 0.6,
    },
    peak: null,
  });
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  /** A working directory of its own: the run writes its report under `cwd`. */
  async function workspace() {
    const directory = await mkdtemp(join(tmpdir(), "difference-eval-"));
    directories.push(directory);
    await cp(
      join(process.cwd(), "tests/fixtures/resume-jd-difference-eval"),
      join(directory, "tests/fixtures/resume-jd-difference-eval"),
      { recursive: true },
    );
    return directory;
  }

  async function report(directory: string) {
    const folder = join(directory, "tmp/resume-jd-difference-eval");
    const [file] = (await readdir(folder)).filter((name) => name.endsWith(".json"));
    return JSON.parse(await readFile(join(folder, file), "utf8")) as {
      outputLocale: string;
      actual: { calls: number; costUsd: number };
      candidates: Array<{ totalTokens: number; promptVersion: string }>;
      cases: Array<{ errors: string[] }>;
    };
  }

  it("reaches the provider, and counts what the provider says it used", async () => {
    // The whole path, with a provider that answers the way /responses does.
    // Only the dry run was ever tested, and the dry run stops before any of
    // this: the harness refused every real request and nobody could tell.
    const cwd = await workspace();
    const requests: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_resource, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        id: "resp_test",
        status: "completed",
        // Not an analysis. What is under test is the harness around the
        // call, and an answer that fails validation still went out, came
        // back and was paid for.
        output: [
          { type: "message", content: [{ type: "output_text", text: "{}" }] },
        ],
        usage: {
          input_tokens: 1000,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 100,
        },
      });
    });

    const exitCode = await runResumeJDDifferenceEvaluationCli({
      argv: ["--prompts=p1", "--locale=en"],
      cwd,
      env: {
        DEEPSEEK_API_KEY: "test-key",
        AI_TEXT_MODEL: "deepseek-flash",
        AI_PRICE_SCHEDULE_JSON: schedule,
      },
      loadEnvironment: () => undefined,
      fetchImpl,
      writeOutput: () => undefined,
      now: () => new Date("2026-09-29T12:00:00.000Z"),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(requests.every((body) => body.max_output_tokens === 4096)).toBe(true);

    const written = await report(cwd);
    expect(written.actual.calls).toBe(6);
    expect(written.outputLocale).toBe("en");
    expect(written.candidates[0].promptVersion).toContain("en");
    // Six calls of 1,100 tokens. This read zero while the harness only knew
    // the other endpoint's names for them.
    expect(written.candidates[0].totalTokens).toBe(6_600);
    expect(written.actual.costUsd).toBeCloseTo(
      (6 * (1000 * 0.15 + 100 * 0.6)) / 1_000_000,
      9,
    );
    expect(
      written.cases.flatMap(({ errors }) => errors),
    ).not.toContain("resume-jd-difference-eval-output-cap-invalid");
    // Nothing valid came back, so nothing is eligible, and the command says
    // so rather than naming a winner.
    expect(exitCode).toBe(2);
  });

  it("refuses a language the product does not ship", async () => {
    await expect(
      runResumeJDDifferenceEvaluationCli({
        argv: ["--dry-run", "--locale=de"],
        cwd: process.cwd(),
        env: {},
        loadEnvironment: () => undefined,
        writeOutput: () => undefined,
      }),
    ).rejects.toThrow("resume-jd-difference-eval-locale-invalid");
  });
});

describe("anonymous difference evaluation fixtures", () => {
  it("validates exactly six bounded fixtures", () => {
    expect(
      fixtures.map((fixture) => differenceEvaluationFixtureSchema.parse(fixture).caseId),
    ).toEqual([
      "01-en-synonym-alignment",
      "02-de-strict-gates",
      "03-en-skill-only",
      "04-de-profile-only",
      "05-en-unsupported",
      "06-en-missing-context-result",
    ]);
    expect(JSON.stringify(fixtures)).not.toMatch(/@|Vittorio|Mercedes|BMW/iu);
  });
});
