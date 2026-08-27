import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

import {
  estimateAITextCost,
  parsePriceSchedule,
  type AIPriceSchedule,
} from "../src/features/ai/pricing";
import { createDeepSeekAIProvider } from "../src/features/extraction/deepseek-extractor";
import type { AIProvider, AIUsage } from "../src/features/extraction/provider";
import {
  JD_GAP_EVAL_MAX_OUTPUT_TOKENS,
  buildSafeEvaluationReport,
  createEvaluationBudgetLedger,
  evaluatePromptCase,
  evaluationFixtureSchema,
  mapFixtureStructureToComparison,
  selectPromptWinner,
  type EvaluationAssessment,
  type EvaluationCriterion,
  type EvaluationFixture,
  type PromptCandidateSummary,
  type PromptCaseScore,
} from "../src/features/jd-gap-analysis/evaluation";
import {
  comparisonPromptVariants,
  type ComparisonPromptVariant,
} from "../src/features/jd-gap-analysis/prompts";
import {
  aggregateRequirement,
  applyDeterministicCriterionPolicy,
} from "../src/features/jd-gap-analysis/policy";
import {
  sanitizeJDGapComparisonOutput,
  sanitizeJDStructureOutput,
} from "../src/features/jd-gap-analysis/sanitizers";
import type {
  CriterionEvidenceStatus,
  JDGapCriterionAssessment,
  JDGapRequirementForComparison,
  JDStructureProviderOutput,
} from "../src/features/jd-gap-analysis/schemas";

const variants = Object.keys(
  comparisonPromptVariants,
) as ComparisonPromptVariant[];

type EvaluationAttempt = {
  callNumber: number;
  usage: AIUsage;
  costUsd: number;
  latencyMs: number;
  status: number | null;
  error: string | null;
};

type VariantState = {
  promptVersion: string;
  scores: PromptCaseScore[];
  attempts: EvaluationAttempt[];
  statusCounts: Record<CriterionEvidenceStatus, number>;
  stability: number;
};

type EvaluationCliDependencies = {
  argv: string[];
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cwd: string;
  loadEnvironment: () => void;
  createProvider: typeof createDeepSeekAIProvider;
  fetchImpl: typeof fetch;
  writeOutput: (message: string) => void;
  now: () => Date;
};

export type EvaluationCliOptions = Partial<EvaluationCliDependencies>;

const emptyUsage: AIUsage = {
  inputCacheHitTokens: 0,
  inputCacheMissTokens: 0,
  outputTokens: 0,
};

function addUsage(left: AIUsage, right: AIUsage): AIUsage {
  return {
    inputCacheHitTokens:
      left.inputCacheHitTokens + right.inputCacheHitTokens,
    inputCacheMissTokens:
      left.inputCacheMissTokens + right.inputCacheMissTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  };
}

function safeErrorCode(error: unknown) {
  if (
    error instanceof Error &&
    /^[a-z0-9][a-z0-9-]{2,119}$/u.test(error.message)
  ) {
    return error.message;
  }
  return "jd-gap-eval-failed";
}

function zeroStatusCounts(): Record<CriterionEvidenceStatus, number> {
  return { direct: 0, partial_direct: 0, none: 0, needs_confirmation: 0 };
}

function sumAttempts(attempts: readonly EvaluationAttempt[]) {
  return attempts.reduce(
    (summary, attempt) => ({
      usage: addUsage(summary.usage, attempt.usage),
      costUsd: summary.costUsd + attempt.costUsd,
      latencyMs: summary.latencyMs + attempt.latencyMs,
    }),
    { usage: emptyUsage, costUsd: 0, latencyMs: 0 },
  );
}

function conservativeRates(schedule: AIPriceSchedule) {
  const rates = [schedule.defaultRates];
  if (schedule.peak) rates.push(schedule.peak.rates);
  return {
    inputCacheMissPerMillion: Math.max(
      ...rates.map((rate) => rate.inputCacheMissPerMillion),
    ),
    outputPerMillion: Math.max(
      ...rates.map((rate) => rate.outputPerMillion),
    ),
  };
}

function usageFromEnvelope(value: unknown): AIUsage | null {
  if (!value || typeof value !== "object") return null;
  const usage = (value as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const record = usage as Record<string, unknown>;
  const read = (key: string) => {
    const candidate = record[key];
    return typeof candidate === "number" &&
      Number.isInteger(candidate) &&
      candidate >= 0
      ? candidate
      : 0;
  };
  return {
    inputCacheHitTokens: read("prompt_cache_hit_tokens"),
    inputCacheMissTokens: read("prompt_cache_miss_tokens"),
    outputTokens: read("completion_tokens"),
  };
}

function estimateConservativeActualCost(
  usage: AIUsage,
  schedule: AIPriceSchedule,
  at: Date,
) {
  const configured = estimateAITextCost(usage, schedule, at);
  if (configured) return configured.amount;
  const rates = conservativeRates(schedule);
  return (
    ((usage.inputCacheHitTokens + usage.inputCacheMissTokens) *
      rates.inputCacheMissPerMillion +
      usage.outputTokens * rates.outputPerMillion) /
    1_000_000
  );
}

function requestMetadata(init?: RequestInit) {
  if (typeof init?.body !== "string") {
    throw new Error("jd-gap-eval-request-body-invalid");
  }
  let maxOutputTokens = JD_GAP_EVAL_MAX_OUTPUT_TOKENS;
  try {
    const parsed = JSON.parse(init.body) as { max_tokens?: unknown };
    if (
      typeof parsed.max_tokens === "number" &&
      Number.isInteger(parsed.max_tokens) &&
      parsed.max_tokens > 0
    ) {
      maxOutputTokens = parsed.max_tokens;
    }
  } catch {
    throw new Error("jd-gap-eval-request-body-invalid");
  }
  return {
    requestBytes: Buffer.byteLength(init.body, "utf8"),
    maxOutputTokens,
  };
}

function createTrackedFetch(input: {
  fetchImpl: typeof fetch;
  schedule: AIPriceSchedule;
  now: () => Date;
}) {
  const rates = conservativeRates(input.schedule);
  const ledger = createEvaluationBudgetLedger(rates);
  const attempts: EvaluationAttempt[] = [];

  const trackedFetch: typeof fetch = async (resource, init) => {
    const reservation = ledger.reserve(requestMetadata(init));
    const startedAt = performance.now();
    let response: Response;
    try {
      response = await input.fetchImpl(resource, init);
    } catch (error) {
      ledger.recordActualCost(reservation.reservedCostUsd);
      attempts.push({
        callNumber: reservation.callNumber,
        usage: emptyUsage,
        costUsd: reservation.reservedCostUsd,
        latencyMs: Math.round(performance.now() - startedAt),
        status: null,
        error: safeErrorCode(error),
      });
      throw error;
    }

    let usage: AIUsage | null = null;
    try {
      usage = usageFromEnvelope(await response.clone().json());
    } catch {
      usage = null;
    }
    const costUsd = usage
      ? estimateConservativeActualCost(usage, input.schedule, input.now())
      : reservation.reservedCostUsd;
    ledger.recordActualCost(costUsd);
    attempts.push({
      callNumber: reservation.callNumber,
      usage: usage ?? emptyUsage,
      costUsd,
      latencyMs: Math.round(performance.now() - startedAt),
      status: response.status,
      error: response.ok ? null : `http-${response.status}`,
    });
    return response;
  };

  return { trackedFetch, attempts, ledger };
}

async function loadFixtures(cwd: string) {
  const fixtureDirectory = path.join(cwd, "tests", "fixtures", "jd-gap-eval");
  const filenames = (await readdir(fixtureDirectory))
    .filter((filename) => filename.endsWith(".json"))
    .sort();
  if (filenames.length !== 6) {
    throw new Error("jd-gap-eval-fixture-count-invalid");
  }
  const fixtures: EvaluationFixture[] = [];
  for (const filename of filenames) {
    const raw = await readFile(path.join(fixtureDirectory, filename), "utf8");
    fixtures.push(evaluationFixtureSchema.parse(JSON.parse(raw)));
  }
  return fixtures;
}

function structureCriterionMaps(
  structure: JDStructureProviderOutput,
  requirements: JDGapRequirementForComparison[],
) {
  const idByLocalKey = new Map<string, string>();
  const localKeyById = new Map<string, string>();
  structure.requirements.forEach((requirement, requirementIndex) => {
    requirement.criteria.forEach((criterion, criterionIndex) => {
      const id = requirements[requirementIndex]?.criteria[criterionIndex]?.id;
      if (!id) throw new Error("jd-gap-eval-structure-map-invalid");
      idByLocalKey.set(criterion.key, id);
      localKeyById.set(id, criterion.key);
    });
  });
  return { idByLocalKey, localKeyById };
}

function structureFailures(input: {
  fixture: EvaluationFixture;
  structure: JDStructureProviderOutput;
  idByLocalKey: Map<string, string>;
}) {
  const failures: string[] = [];
  if (
    input.structure.requirements.length <
    input.fixture.expected.minimumRequirementCount
  ) {
    failures.push("structure-requirement-recall");
  }
  for (const expected of input.fixture.expected.criteria) {
    if (!input.idByLocalKey.has(expected.criterionKey)) {
      failures.push("structure-expected-criterion-missing");
      break;
    }
  }
  return failures;
}

function applyPolicyToAssessments(input: {
  requirements: JDGapRequirementForComparison[];
  assessments: JDGapCriterionAssessment[];
  confirmedAuthorizationFactIds: string[];
}) {
  const assessmentById = new Map(
    input.assessments.map((assessment) => [assessment.criterionId, assessment]),
  );
  const authorizationFactIds = new Set(input.confirmedAuthorizationFactIds);
  return input.requirements.flatMap((requirement) =>
    requirement.criteria.map((criterion) => {
      const assessment = assessmentById.get(criterion.id);
      if (!assessment) throw new Error("jd-gap-invalid-output");
      return applyDeterministicCriterionPolicy({
        requirement,
        criterion,
        assessment,
        hasConfirmedAuthorizationFact: assessment.profileFactIds.some((factId) =>
          authorizationFactIds.has(factId),
        ),
      });
    }),
  );
}

function evaluateVariantCase(input: {
  fixture: EvaluationFixture;
  requirements: JDGapRequirementForComparison[];
  localKeyById: Map<string, string>;
  assessments: JDGapCriterionAssessment[];
  sharedFailures: string[];
}) {
  const assessmentById = new Map(
    input.assessments.map((assessment) => [assessment.criterionId, assessment]),
  );
  const expectedByKey = new Map(
    input.fixture.expected.criteria.map((criterion) => [
      criterion.criterionKey,
      criterion.expectedStatus,
    ]),
  );
  const criteria: EvaluationCriterion[] = input.requirements.flatMap(
    (requirement) =>
      requirement.criteria.map((criterion) => ({
        criterionId: criterion.id,
        requirementId: requirement.id,
        requirementType: requirement.requirementType,
        groupKey: criterion.groupKey,
        groupRule: criterion.groupRule,
        expectedStatus:
          expectedByKey.get(input.localKeyById.get(criterion.id) ?? "") ??
          assessmentById.get(criterion.id)?.resumeEvidenceStatus ??
          "none",
      })),
  );
  const requirementResults = input.requirements.map((requirement) => {
    const criterionIds = new Set(
      requirement.criteria.map((criterion) => criterion.id),
    );
    const result = aggregateRequirement({
      requirementId: requirement.id,
      requirementType: requirement.requirementType,
      explicitGate: requirement.explicitGate,
      allowsEquivalent: requirement.allowsEquivalent,
      criteria: requirement.criteria,
      assessments: input.assessments.filter((assessment) =>
        criterionIds.has(assessment.criterionId),
      ),
      sourceOrder: requirement.sortOrder,
    });
    return { ...result, requirementType: requirement.requirementType };
  });
  const assessments: EvaluationAssessment[] = input.assessments.map(
    (assessment) => ({ ...assessment }),
  );
  const score = evaluatePromptCase({
    caseId: input.fixture.caseId,
    resumeText: input.fixture.resumeText,
    criteria,
    assessments,
    requirementResults,
  });
  return {
    ...score,
    hardGateFailures: [
      ...new Set([...input.sharedFailures, ...score.hardGateFailures]),
    ],
  };
}

function summarizeCandidate(
  variant: ComparisonPromptVariant,
  state: VariantState,
): PromptCandidateSummary {
  const attemptSummary = sumAttempts(state.attempts);
  const caseCount = state.scores.length;
  return {
    variant,
    promptVersion: state.promptVersion,
    hardGateFailures: [
      ...new Set(
        state.scores.flatMap((score) =>
          score.hardGateFailures.map(
            (failure) => `${score.caseId}:${failure}`,
          ),
        ),
      ),
    ],
    falsePositiveCount: state.scores.reduce(
      (sum, score) => sum + score.falsePositiveCount,
      0,
    ),
    falseNegativeCount: state.scores.reduce(
      (sum, score) => sum + score.falseNegativeCount,
      0,
    ),
    statusAccuracy:
      caseCount === 0
        ? 0
        : state.scores.reduce(
            (sum, score) => sum + score.statusAccuracy,
            0,
          ) / caseCount,
    requirementRecall:
      caseCount === 0
        ? 0
        : state.scores.reduce(
            (sum, score) => sum + score.requirementRecall,
            0,
          ) / caseCount,
    gapExplanationScore:
      caseCount === 0
        ? 0
        : state.scores.reduce(
            (sum, score) => sum + score.gapExplanationScore,
            0,
          ) / caseCount,
    stability: state.stability,
    totalTokens:
      attemptSummary.usage.inputCacheHitTokens +
      attemptSummary.usage.inputCacheMissTokens +
      attemptSummary.usage.outputTokens,
    costUsd: attemptSummary.costUsd,
    latencyMs: attemptSummary.latencyMs,
  };
}

function qualityTie(candidates: PromptCandidateSummary[]) {
  const eligible = candidates
    .filter((candidate) => candidate.hardGateFailures.length === 0)
    .sort(
      (left, right) =>
        left.falsePositiveCount - right.falsePositiveCount ||
        left.falseNegativeCount - right.falseNegativeCount ||
        right.statusAccuracy - left.statusAccuracy ||
        right.requirementRecall - left.requirementRecall ||
        right.gapExplanationScore - left.gapExplanationScore,
    );
  if (eligible.length < 2) return false;
  return (
    eligible[0].falsePositiveCount === eligible[1].falsePositiveCount &&
    eligible[0].falseNegativeCount === eligible[1].falseNegativeCount &&
    eligible[0].statusAccuracy === eligible[1].statusAccuracy &&
    eligible[0].requirementRecall === eligible[1].requirementRecall &&
    eligible[0].gapExplanationScore === eligible[1].gapExplanationScore
  );
}

export async function runEvaluationCli(
  options: EvaluationCliOptions = {},
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((message) => console.log(message));
  const now = options.now ?? (() => new Date());
  const loadEnvironment =
    options.loadEnvironment ?? (() => void loadEnvConfig(cwd));
  const createProvider = options.createProvider ?? createDeepSeekAIProvider;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const argv = options.argv ?? process.argv.slice(2);

  loadEnvironment();
  if (env.RUN_JD_GAP_EVAL !== "1") {
    writeOutput("jd-gap-eval-explicit-opt-in-required");
    return 0;
  }

  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("deepseek-api-key-missing");
  const model = env.AI_TEXT_MODEL?.trim() || "deepseek-v4-flash";
  const rawSchedule = env.AI_PRICE_SCHEDULE_JSON;
  if (!rawSchedule) throw new Error("jd-gap-eval-price-schedule-missing");
  const schedule = parsePriceSchedule(rawSchedule);
  if (schedule.provider !== "deepseek" || schedule.model !== model) {
    throw new Error("jd-gap-eval-price-schedule-model-mismatch");
  }

  const fixtures = await loadFixtures(cwd);
  const tracking = createTrackedFetch({ fetchImpl, schedule, now });
  const provider: AIProvider = createProvider({
    apiKey,
    model,
    fetchImpl: tracking.trackedFetch,
    jdGapMaxTokens: JD_GAP_EVAL_MAX_OUTPUT_TOKENS,
  });
  const states = new Map<ComparisonPromptVariant, VariantState>(
    variants.map((variant) => [
      variant,
      {
        promptVersion: comparisonPromptVariants[variant].version,
        scores: [],
        attempts: [],
        statusCounts: zeroStatusCounts(),
        stability: 1,
      },
    ]),
  );
  const safeCases: Array<{
    caseId: string;
    statusCounts: Record<CriterionEvidenceStatus, number>;
    usage: { inputTokens: number; outputTokens: number };
    costUsd: number;
    latencyMs: number;
    errors: string[];
  }> = [];
  const successfulCases: Array<{
    fixture: EvaluationFixture;
    requirements: JDGapRequirementForComparison[];
    localKeyById: Map<string, string>;
    sharedFailures: string[];
    originalAssessments: Map<ComparisonPromptVariant, JDGapCriterionAssessment[]>;
  }> = [];

  for (const fixture of fixtures) {
    const stageOneStart = tracking.attempts.length;
    const structureResult = await provider.structureJobDescription({
      jdText: fixture.jdText,
    });
    const structure = sanitizeJDStructureOutput({
      jdText: fixture.jdText,
      output: structureResult.data,
    });
    const requirements = mapFixtureStructureToComparison(
      fixture.caseId,
      structure,
    );
    const maps = structureCriterionMaps(structure, requirements);
    const sharedFailures = structureFailures({
      fixture,
      structure,
      idByLocalKey: maps.idByLocalKey,
    });
    const stageOneAttempts = tracking.attempts.slice(stageOneStart);
    const stageOneSummary = sumAttempts(stageOneAttempts);
    safeCases.push({
      caseId: fixture.caseId,
      statusCounts: zeroStatusCounts(),
      usage: {
        inputTokens:
          stageOneSummary.usage.inputCacheHitTokens +
          stageOneSummary.usage.inputCacheMissTokens,
        outputTokens: stageOneSummary.usage.outputTokens,
      },
      costUsd: stageOneSummary.costUsd,
      latencyMs: stageOneSummary.latencyMs,
      errors: [...sharedFailures],
    });

    const originalAssessments = new Map<
      ComparisonPromptVariant,
      JDGapCriterionAssessment[]
    >();
    for (const variant of variants) {
      const attemptStart = tracking.attempts.length;
      const comparison = await provider.compareJDGapCriteria(
        {
          resumeText: fixture.resumeText,
          requirements,
          confirmedFacts: fixture.confirmedFacts,
        },
        { promptVariant: variant },
      );
      const sanitized = sanitizeJDGapComparisonOutput({
        resumeText: fixture.resumeText,
        requirements,
        confirmedFacts: fixture.confirmedFacts,
        confirmedAuthorizationFactIds:
          fixture.confirmedAuthorizationFactIds,
        output: comparison.data,
      });
      const assessments = applyPolicyToAssessments({
        requirements,
        assessments: sanitized.assessments,
        confirmedAuthorizationFactIds:
          fixture.confirmedAuthorizationFactIds,
      });
      originalAssessments.set(variant, assessments);
      const score = evaluateVariantCase({
        fixture,
        requirements,
        localKeyById: maps.localKeyById,
        assessments,
        sharedFailures,
      });
      const attempts = tracking.attempts.slice(attemptStart);
      const state = states.get(variant)!;
      state.scores.push(score);
      state.attempts.push(...attempts);
      for (const assessment of assessments) {
        state.statusCounts[assessment.resumeEvidenceStatus] += 1;
      }
      const attemptSummary = sumAttempts(attempts);
      safeCases.push({
        caseId: `${fixture.caseId}:${variant}`,
        statusCounts: assessments.reduce(
          (counts, assessment) => {
            counts[assessment.resumeEvidenceStatus] += 1;
            return counts;
          },
          zeroStatusCounts(),
        ),
        usage: {
          inputTokens:
            attemptSummary.usage.inputCacheHitTokens +
            attemptSummary.usage.inputCacheMissTokens,
          outputTokens: attemptSummary.usage.outputTokens,
        },
        costUsd: attemptSummary.costUsd,
        latencyMs: attemptSummary.latencyMs,
        errors: [...score.hardGateFailures],
      });
    }
    successfulCases.push({
      fixture,
      requirements,
      localKeyById: maps.localKeyById,
      sharedFailures,
      originalAssessments,
    });
  }

  let summaries = variants.map((variant) =>
    summarizeCandidate(variant, states.get(variant)!),
  );
  const wantsStability = argv.includes("--stability");
  if (wantsStability && qualityTie(summaries)) {
    const preliminaryWinner = selectPromptWinner(summaries);
    const state = states.get(preliminaryWinner.variant)!;
    let comparedCriteria = 0;
    let stableCriteria = 0;
    for (const testCase of successfulCases.slice(0, 6)) {
      const attemptStart = tracking.attempts.length;
      const repeated = await provider.compareJDGapCriteria(
        {
          resumeText: testCase.fixture.resumeText,
          requirements: testCase.requirements,
          confirmedFacts: testCase.fixture.confirmedFacts,
        },
        { promptVariant: preliminaryWinner.variant },
      );
      const sanitized = sanitizeJDGapComparisonOutput({
        resumeText: testCase.fixture.resumeText,
        requirements: testCase.requirements,
        confirmedFacts: testCase.fixture.confirmedFacts,
        confirmedAuthorizationFactIds:
          testCase.fixture.confirmedAuthorizationFactIds,
        output: repeated.data,
      });
      const assessments = applyPolicyToAssessments({
        requirements: testCase.requirements,
        assessments: sanitized.assessments,
        confirmedAuthorizationFactIds:
          testCase.fixture.confirmedAuthorizationFactIds,
      });
      const original = new Map(
        testCase.originalAssessments
          .get(preliminaryWinner.variant)!
          .map((assessment) => [assessment.criterionId, assessment]),
      );
      for (const assessment of assessments) {
        comparedCriteria += 1;
        if (
          original.get(assessment.criterionId)?.resumeEvidenceStatus ===
          assessment.resumeEvidenceStatus
        ) {
          stableCriteria += 1;
        }
      }
      state.attempts.push(...tracking.attempts.slice(attemptStart));
    }
    state.stability =
      comparedCriteria === 0 ? 0 : stableCriteria / comparedCriteria;
    summaries = variants.map((variant) =>
      summarizeCandidate(variant, states.get(variant)!),
    );
  }

  const winner = selectPromptWinner(summaries);
  const budget = tracking.ledger.snapshot();
  const report = {
    ...buildSafeEvaluationReport({
      model,
      collectedAt: now().toISOString(),
      totalCalls: budget.callCount,
      totalCostUsd: budget.actualCostUsd,
      winner: winner.variant,
      cases: safeCases,
    }),
    prompts: summaries.map((summary) => ({ ...summary })),
  };
  const reportDirectory = path.join(cwd, "tmp", "jd-gap-eval");
  await mkdir(reportDirectory, { recursive: true });
  const reportFilename = `${now().toISOString().replaceAll(":", "-")}.json`;
  const reportPath = path.join(reportDirectory, reportFilename);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeOutput(
    `jd-gap-eval-complete calls=${budget.callCount} cost_usd=${budget.actualCostUsd.toFixed(6)} winner=${winner.variant} report=${path.relative(cwd, reportPath)}`,
  );
  return 0;
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  runEvaluationCli().catch((error) => {
    console.error(safeErrorCode(error));
    process.exitCode = 1;
  });
}
