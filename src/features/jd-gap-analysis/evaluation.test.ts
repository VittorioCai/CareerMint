import { describe, expect, it } from "vitest";

import { runEvaluationCli } from "../../../scripts/evaluate-jd-gap-prompts";
import fixture01 from "../../../tests/fixtures/jd-gap-eval/01-en-composite.json";
import fixture02 from "../../../tests/fixtures/jd-gap-eval/02-de-degree-equivalence.json";
import fixture03 from "../../../tests/fixtures/jd-gap-eval/03-years-cert-tools.json";
import fixture04 from "../../../tests/fixtures/jd-gap-eval/04-language-authorization.json";
import fixture05 from "../../../tests/fixtures/jd-gap-eval/05-industry-responsibility.json";
import fixture06 from "../../../tests/fixtures/jd-gap-eval/06-false-positive-trap.json";

import {
  JD_GAP_EVAL_MAX_CALLS,
  JD_GAP_EVAL_MAX_COST_USD,
  JD_GAP_EVAL_MAX_OUTPUT_TOKENS,
  buildSafeEvaluationReport,
  createEvaluationBudgetLedger,
  evaluationFixtureSchema,
  evaluatePromptCase,
  mapFixtureStructureToComparison,
  selectPromptWinner,
  type PromptCaseEvaluationInput,
  type PromptCandidateSummary,
} from "./evaluation";
import type { JDStructureProviderOutput } from "./schemas";

const requirementId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const criterionId = "11111111-1111-4111-8111-111111111111";
const secondCriterionId = "22222222-2222-4222-8222-222222222222";

function baseCase(): PromptCaseEvaluationInput {
  return {
    caseId: "synthetic-case",
    resumeText: "Used SQL to build weekly commercial reports.",
    criteria: [
      {
        criterionId,
        requirementId,
        requirementType: "required" as const,
        groupKey: "g1",
        groupRule: "all" as const,
        expectedStatus: "direct" as const,
      },
    ],
    assessments: [
      {
        criterionId,
        resumeEvidenceStatus: "direct" as const,
        resumeExcerpt: "Used SQL to build weekly commercial reports.",
        profileFactIds: [],
        gapType: "none" as const,
        reasonZh: "简历明确证明了 SQL 商业报告经验。",
        userQuestionZh: null,
      },
    ],
    requirementResults: [
      {
        requirementId,
        requirementType: "required" as const,
        coverageStatus: "complete" as const,
        impactLevel: "important" as const,
      },
    ],
  };
}

describe("JD gap prompt evaluation hard gates", () => {
  it("rejects invalid quotes, profile-driven upgrades, and missing criteria", () => {
    const invalidQuote = baseCase();
    invalidQuote.assessments[0].resumeExcerpt = "Used Python in production.";
    expect(evaluatePromptCase(invalidQuote).hardGateFailures).toContain(
      "invalid-resume-quote",
    );

    const profileUpgrade = baseCase();
    profileUpgrade.assessments[0] = {
      ...profileUpgrade.assessments[0],
      resumeExcerpt: null,
      profileFactIds: ["33333333-3333-4333-8333-333333333333"],
    };
    expect(evaluatePromptCase(profileUpgrade).hardGateFailures).toContain(
      "profile-driven-coverage-upgrade",
    );

    const missing = baseCase();
    missing.assessments = [];
    expect(evaluatePromptCase(missing).hardGateFailures).toContain(
      "criterion-set-mismatch",
    );
  });

  it("rejects complete results with an incomplete group and preferred blocking", () => {
    const incompleteGroup = baseCase();
    incompleteGroup.criteria.push({
      criterionId: secondCriterionId,
      requirementId,
      requirementType: "required",
      groupKey: "g2",
      groupRule: "all",
      expectedStatus: "none",
    });
    incompleteGroup.assessments.push({
      criterionId: secondCriterionId,
      resumeEvidenceStatus: "none",
      resumeExcerpt: null,
      profileFactIds: [],
      gapType: "no_supporting_fact",
      reasonZh: "没有相关证据。",
      userQuestionZh: null,
    });
    expect(evaluatePromptCase(incompleteGroup).hardGateFailures).toContain(
      "complete-with-incomplete-group",
    );

    const preferredBlocking = baseCase();
    preferredBlocking.criteria[0].requirementType = "preferred";
    preferredBlocking.requirementResults[0].requirementType = "preferred";
    preferredBlocking.requirementResults[0].impactLevel = "blocking";
    expect(evaluatePromptCase(preferredBlocking).hardGateFailures).toContain(
      "preferred-requirement-blocking",
    );
  });

  it("penalizes false-positive coverage more than a false negative", () => {
    const falsePositive = baseCase();
    falsePositive.criteria[0].expectedStatus = "none";
    const falseNegative = baseCase();
    falseNegative.assessments[0] = {
      ...falseNegative.assessments[0],
      resumeEvidenceStatus: "none",
      resumeExcerpt: null,
      gapType: "no_supporting_fact",
    };
    falseNegative.requirementResults[0].coverageStatus = "none";

    const positiveScore = evaluatePromptCase(falsePositive);
    const negativeScore = evaluatePromptCase(falseNegative);
    expect(positiveScore.falsePositiveCount).toBe(1);
    expect(positiveScore.weightedScore).toBeLessThan(negativeScore.weightedScore);
  });
});

describe("prompt winner selection", () => {
  function summary(
    variant: "p1" | "p2" | "p3",
    overrides: Partial<PromptCandidateSummary> = {},
  ): PromptCandidateSummary {
    return {
      variant,
      promptVersion: `prompt-${variant}`,
      hardGateFailures: [],
      falsePositiveCount: 0,
      requirementRecall: 1,
      gapExplanationScore: 1,
      stability: 1,
      totalTokens: 100,
      costUsd: 0.001,
      latencyMs: 100,
      ...overrides,
    };
  }

  it("eliminates hard-gate failures and uses the deterministic tie-break order", () => {
    expect(
      selectPromptWinner([
        summary("p1", { hardGateFailures: ["invalid-resume-quote"] }),
        summary("p2", { falsePositiveCount: 1, requirementRecall: 1 }),
        summary("p3", { falsePositiveCount: 0, requirementRecall: 0.9 }),
      ]).variant,
    ).toBe("p3");

    expect(
      selectPromptWinner([
        summary("p1", { requirementRecall: 0.9 }),
        summary("p2", { requirementRecall: 1, gapExplanationScore: 0.8 }),
        summary("p3", { requirementRecall: 1, gapExplanationScore: 0.9 }),
      ]).variant,
    ).toBe("p3");

    expect(
      selectPromptWinner([
        summary("p1", { totalTokens: 90, costUsd: 0.002, latencyMs: 50 }),
        summary("p2", { totalTokens: 80, costUsd: 0.003, latencyMs: 40 }),
      ]).variant,
    ).toBe("p2");
  });
});

describe("evaluation budget and safe reporting", () => {
  it("exits before constructing a provider without explicit opt-in", async () => {
    let providerConstructed = false;
    const output: string[] = [];

    const exitCode = await runEvaluationCli({
      argv: [],
      env: {},
      loadEnvironment: () => undefined,
      createProvider: () => {
        providerConstructed = true;
        throw new Error("provider-must-not-be-constructed");
      },
      writeOutput: (message) => output.push(message),
    });

    expect(exitCode).toBe(0);
    expect(providerConstructed).toBe(false);
    expect(output).toEqual(["jd-gap-eval-explicit-opt-in-required"]);
  });

  it("uses the approved limits and refuses call 31", () => {
    expect(JD_GAP_EVAL_MAX_CALLS).toBe(30);
    expect(JD_GAP_EVAL_MAX_COST_USD).toBe(2);
    expect(JD_GAP_EVAL_MAX_OUTPUT_TOKENS).toBe(4096);
    const ledger = createEvaluationBudgetLedger({
      inputCacheMissPerMillion: 0,
      outputPerMillion: 0,
    });

    for (let index = 0; index < 30; index += 1) {
      ledger.reserve({ requestBytes: 100 });
    }
    expect(() => ledger.reserve({ requestBytes: 100 })).toThrow(
      "jd-gap-eval-call-cap-exceeded",
    );
  });

  it("refuses a request when actual spend plus its conservative reserve exceeds USD 2", () => {
    const ledger = createEvaluationBudgetLedger({
      inputCacheMissPerMillion: 100,
      outputPerMillion: 100,
    });
    ledger.recordActualCost(1.5);

    expect(() =>
      ledger.reserve({ requestBytes: 1_000, maxOutputTokens: 4096 }),
    ).toThrow("jd-gap-eval-cost-cap-exceeded");
  });

  it("reports metadata and never carries raw source documents or provider output", () => {
    const report = buildSafeEvaluationReport({
      model: "synthetic-model",
      collectedAt: "2026-08-25T00:00:00.000Z",
      totalCalls: 24,
      totalCostUsd: 0.02,
      winner: "p2",
      cases: [
        {
          caseId: "case-01",
          statusCounts: { direct: 1, partial_direct: 1, none: 1, needs_confirmation: 0 },
          usage: { inputTokens: 100, outputTokens: 50 },
          costUsd: 0.001,
          latencyMs: 120,
          errors: [],
          jdText: "SECRET JD",
          resumeText: "SECRET RESUME",
          providerResponse: { secret: "SECRET RESPONSE" },
        },
      ],
    });

    const serialized = JSON.stringify(report);
    expect(serialized).toContain("case-01");
    expect(serialized).toContain("statusCounts");
    expect(serialized).not.toContain("SECRET JD");
    expect(serialized).not.toContain("SECRET RESUME");
    expect(serialized).not.toContain("SECRET RESPONSE");
  });
});

describe("irreversible fixture contracts", () => {
  const fixtures = [fixture01, fixture02, fixture03, fixture04, fixture05, fixture06];
  const structure: JDStructureProviderOutput = {
    jdTranslationZh: "要求 SQL 或 Python，并具备三年经验。",
    requirements: [
      {
        key: "r1",
        category: "skill",
        requirementType: "required",
        originalText: "SQL or Python and three years of experience",
        translationZh: "SQL 或 Python，并具备三年经验",
        sourceExcerpt: "SQL or Python and three years of experience",
        allowsEquivalent: false,
        explicitGate: true,
        criteria: [
          {
            key: "c1",
            groupKey: "g1",
            groupRule: "any",
            kind: "tool",
            originalText: "SQL",
            translationZh: "SQL",
            constraint: { operator: "one_of", value: "SQL|Python", unit: null },
          },
          {
            key: "c2",
            groupKey: "g2",
            groupRule: "all",
            kind: "years_experience",
            originalText: "three years of experience",
            translationZh: "三年经验",
            constraint: { operator: "gte", value: "3", unit: "years" },
          },
        ],
      },
    ],
  };

  it("validates synthetic fixture bounds and rejects source-sized payloads", () => {
    const valid = {
      caseId: "01-en-composite",
      jdText: "SQL or Python and three years of experience are required.",
      resumeText: "Used SQL for four years to create weekly sales reports.",
      confirmedFacts: [],
      confirmedAuthorizationFactIds: [],
      expected: {
        minimumRequirementCount: 1,
        criteria: [
          {
            criterionKey: "c1",
            expectedStatus: "direct",
          },
          {
            criterionKey: "c2",
            expectedStatus: "direct",
          },
        ],
      },
    };

    expect(evaluationFixtureSchema.parse(valid)).toEqual(valid);
    expect(
      evaluationFixtureSchema.safeParse({ ...valid, jdText: "x".repeat(30_001) })
        .success,
    ).toBe(false);
    expect(
      evaluationFixtureSchema.safeParse({ ...valid, contactEmail: "person@example.com" })
        .success,
    ).toBe(false);
  });

  it("validates every committed synthetic fixture", () => {
    expect(
      fixtures.map((fixture) => evaluationFixtureSchema.parse(fixture).caseId),
    ).toEqual([
      "01-en-composite",
      "02-de-degree-equivalence",
      "03-years-cert-tools",
      "04-language-authorization",
      "05-industry-responsibility",
      "06-false-positive-trap",
    ]);
  });

  it("maps local structure keys to stable UUIDv5 IDs", () => {
    const first = mapFixtureStructureToComparison("01-en-composite", structure);
    const second = mapFixtureStructureToComparison("01-en-composite", structure);
    const other = mapFixtureStructureToComparison("02-de-degree", structure);

    expect(first).toEqual(second);
    expect(first[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(first[0].criteria[0].id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(first[0].id).not.toBe(other[0].id);
    expect(first[0].criteria.map((criterion) => criterion.sortOrder)).toEqual([0, 1]);
  });
});
