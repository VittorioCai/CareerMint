import { describe, expect, it } from "vitest";

import { runResumeJDDifferenceEvaluationCli } from "../../../scripts/evaluate-resume-jd-difference-prompts";

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
  selectDifferencePromptWinner,
  type DifferencePromptCandidateSummary,
} from "./evaluation";
import type { ResumeJDDifferenceOutput } from "./schemas";

const fixtures = [fixture01, fixture02, fixture03, fixture04, fixture05, fixture06];

const output: ResumeJDDifferenceOutput = {
  jobCore: {
    missionZh: "用可信的数据报告支持业务决策。",
    coreCapabilities: ["数据分析", "报告", "业务协作"],
    concepts: [
      {
        id: "concept-1",
        labelZh: "利益相关方沟通",
        originalTerms: ["stakeholder management"],
        importanceReasonZh: "职责与要求均强调。",
        priority: "critical",
      },
      {
        id: "concept-2",
        labelZh: "A/B 测试",
        originalTerms: ["A/B testing"],
        importanceReasonZh: "核心分析方法。",
        priority: "important",
      },
    ],
    gates: [],
    preferredItems: [],
  },
  overallDifference: {
    summaryZh: "简历有业务报告经历，但没有 A/B 测试证据。",
    topIssueIds: ["issue-1"],
  },
  issues: [
    {
      id: "issue-1",
      conceptId: "concept-2",
      jdOriginal: "Experience with A/B testing",
      jdTranslationZh: "具备 A/B 测试经验",
      resumeExcerpt: null,
      resumeStatusZh: "当前材料未找到相关证据",
      profileFactIds: [],
      type: "missing",
      problemZh: "简历未体现 A/B 测试。",
      reasonZh: "简历中没有该方法的可回查表述。",
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
      jdTranslationZh: "利益相关方管理",
      resumeExcerpt: "Worked with business teams to align weekly reporting needs.",
      profileFactIds: [],
      reasonZh: "职责语义一致，并有原文证据。",
    },
  ],
  directions: [
    {
      id: "direction-1",
      issueId: "issue-1",
      targetSection: "experience",
      targetExperienceZh: null,
      conceptId: "concept-2",
      jdTerms: [],
      focusAreas: ["method", "context", "result"],
      synonymousJobLanguage: [],
      authenticity: "unsupported",
      needsConfirmation: true,
      directionZh: "先确认是否真实做过实验设计、指标选择和结果评估；未做过则不要加入。",
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
    rewrite.directions[0]!.directionZh =
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
      jdTranslationZh: "具备 A/B 测试经验",
      resumeExcerpt: "Worked with business teams to align weekly reporting needs.",
      profileFactIds: [],
      reasonZh: "错误地把一般协作当作实验经验。",
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
      "fixtures=6 prompts=p1,p2,p3 max_calls=18 max_cost_usd=1.000000 max_output_tokens=4096",
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
