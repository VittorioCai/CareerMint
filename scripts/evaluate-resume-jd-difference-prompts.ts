import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
import type { AIUsage } from "../src/features/extraction/provider";
import {
  RESUME_JD_DIFFERENCE_EVAL_MAX_CALLS,
  RESUME_JD_DIFFERENCE_EVAL_MAX_COST_USD,
  RESUME_JD_DIFFERENCE_EVAL_MAX_OUTPUT_TOKENS,
  createDifferenceEvaluationBudgetLedger,
  differenceEvaluationFixtureSchema,
  evaluateDifferenceCase,
  selectDifferencePromptWinner,
  statusCounts,
  type DifferenceCaseScore,
  type DifferenceEvaluationFixture,
  type DifferencePromptCandidateSummary,
} from "../src/features/resume-jd-difference/evaluation";
import {
  differencePromptVariants,
  type DifferencePromptVariant,
} from "../src/features/resume-jd-difference/prompts";
import type { DifferenceIssueType } from "../src/features/resume-jd-difference/schemas";

type EvaluationAttempt = {
  usage: AIUsage;
  costUsd: number;
  latencyMs: number;
  status: number | null;
  error: string | null;
};

type CandidateState = {
  scores: DifferenceCaseScore[];
  attempts: EvaluationAttempt[];
};

type CliDependencies = {
  argv: string[];
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cwd: string;
  loadEnvironment: () => void;
  createProvider: typeof createDeepSeekAIProvider;
  fetchImpl: typeof fetch;
  writeOutput: (message: string) => void;
  now: () => Date;
};

export type ResumeJDDifferenceEvaluationCliOptions = Partial<CliDependencies>;

const allVariants = Object.keys(
  differencePromptVariants,
) as DifferencePromptVariant[];

const emptyUsage: AIUsage = {
  inputCacheHitTokens: 0,
  inputCacheMissTokens: 0,
  outputTokens: 0,
};

function addUsage(left: AIUsage, right: AIUsage): AIUsage {
  return {
    inputCacheHitTokens: left.inputCacheHitTokens + right.inputCacheHitTokens,
    inputCacheMissTokens: left.inputCacheMissTokens + right.inputCacheMissTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  };
}

function parseOptions(argv: string[]) {
  let dryRun = false;
  let maxCostUsd = RESUME_JD_DIFFERENCE_EVAL_MAX_COST_USD;
  let variants = [...allVariants];
  for (const argument of argv) {
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument.startsWith("--prompts=")) {
      const requested = argument.slice("--prompts=".length).split(",");
      if (
        requested.length === 0 ||
        new Set(requested).size !== requested.length ||
        requested.some((item) => !allVariants.includes(item as DifferencePromptVariant))
      ) {
        throw new Error("resume-jd-difference-eval-prompts-invalid");
      }
      variants = requested as DifferencePromptVariant[];
      continue;
    }
    if (argument.startsWith("--max-cost-usd=")) {
      maxCostUsd = Number(argument.slice("--max-cost-usd=".length));
      if (
        !Number.isFinite(maxCostUsd) ||
        maxCostUsd <= 0 ||
        maxCostUsd > RESUME_JD_DIFFERENCE_EVAL_MAX_COST_USD
      ) {
        throw new Error("resume-jd-difference-eval-cost-cap-invalid");
      }
      continue;
    }
    throw new Error("resume-jd-difference-eval-argument-invalid");
  }
  return { dryRun, maxCostUsd, variants };
}

async function loadFixtures(cwd: string) {
  const directory = path.join(
    cwd,
    "tests",
    "fixtures",
    "resume-jd-difference-eval",
  );
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith(".json"))
    .sort();
  if (filenames.length !== 6) {
    throw new Error("resume-jd-difference-eval-fixture-count-invalid");
  }
  const fixtures: DifferenceEvaluationFixture[] = [];
  for (const filename of filenames) {
    const raw = await readFile(path.join(directory, filename), "utf8");
    fixtures.push(differenceEvaluationFixtureSchema.parse(JSON.parse(raw)));
  }
  return fixtures;
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
  const token = (key: string) => {
    const value = record[key];
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value
      : 0;
  };
  return {
    inputCacheHitTokens: token("prompt_cache_hit_tokens"),
    inputCacheMissTokens: token("prompt_cache_miss_tokens"),
    outputTokens: token("completion_tokens"),
  };
}

function actualCost(usage: AIUsage, schedule: AIPriceSchedule, at: Date) {
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

function safeError(error: unknown) {
  if (
    error instanceof Error &&
    /^[a-z0-9][a-z0-9-]{2,119}$/u.test(error.message)
  ) {
    return error.message;
  }
  return "resume-jd-difference-eval-failed";
}

function createTrackedFetch(input: {
  fetchImpl: typeof fetch;
  schedule: AIPriceSchedule;
  now: () => Date;
  maxCalls: number;
  maxCostUsd: number;
}) {
  const rates = conservativeRates(input.schedule);
  const ledger = createDifferenceEvaluationBudgetLedger({
    ...rates,
    maxCalls: input.maxCalls,
    maxCostUsd: input.maxCostUsd,
  });
  const attempts: EvaluationAttempt[] = [];
  const trackedFetch: typeof fetch = async (resource, init) => {
    if (typeof init?.body !== "string") {
      throw new Error("resume-jd-difference-eval-request-invalid");
    }
    const body = JSON.parse(init.body) as { max_tokens?: unknown };
    if (body.max_tokens !== RESUME_JD_DIFFERENCE_EVAL_MAX_OUTPUT_TOKENS) {
      throw new Error("resume-jd-difference-eval-output-cap-invalid");
    }
    const reservation = ledger.reserve({
      requestBytes: Buffer.byteLength(init.body, "utf8"),
      maxOutputTokens: RESUME_JD_DIFFERENCE_EVAL_MAX_OUTPUT_TOKENS,
    });
    const startedAt = performance.now();
    let response: Response;
    try {
      response = await input.fetchImpl(resource, init);
    } catch (error) {
      ledger.recordActualCost(reservation.reservedCostUsd);
      attempts.push({
        usage: emptyUsage,
        costUsd: reservation.reservedCostUsd,
        latencyMs: Math.round(performance.now() - startedAt),
        status: null,
        error: safeError(error),
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
      ? actualCost(usage, input.schedule, input.now())
      : reservation.reservedCostUsd;
    ledger.recordActualCost(costUsd);
    attempts.push({
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

function invalidCaseScore(caseId: string, error: string): DifferenceCaseScore {
  return {
    caseId,
    schemaValid: false,
    hardGateFailures: [error],
    coreIssueRecall: 0,
    matchedRecall: 0,
    falseSemanticAlignmentCount: 0,
    unsupportedFalsePositiveCount: 0,
    typeAccuracy: 0,
    priorityAccuracy: 0,
    directionLinkRate: 0,
    pasteReadyRewriteCount: 0,
    fabricatedFactCount: 0,
  };
}

function sumAttempts(attempts: readonly EvaluationAttempt[]) {
  return attempts.reduce(
    (total, attempt) => ({
      usage: addUsage(total.usage, attempt.usage),
      costUsd: total.costUsd + attempt.costUsd,
      latencyMs: total.latencyMs + attempt.latencyMs,
    }),
    { usage: emptyUsage, costUsd: 0, latencyMs: 0 },
  );
}

function average(scores: DifferenceCaseScore[], key: keyof DifferenceCaseScore) {
  if (scores.length === 0) return 0;
  return (
    scores.reduce((sum, score) => sum + Number(score[key]), 0) / scores.length
  );
}

function summarize(
  variant: DifferencePromptVariant,
  state: CandidateState,
): DifferencePromptCandidateSummary {
  const attempts = sumAttempts(state.attempts);
  const sum = (key: keyof DifferenceCaseScore) =>
    state.scores.reduce((total, score) => total + Number(score[key]), 0);
  return {
    variant,
    promptVersion: differencePromptVariants[variant].version,
    schemaValidRate: average(state.scores, "schemaValid"),
    hardGateFailures: [
      ...new Set(
        state.scores.flatMap((score) =>
          score.hardGateFailures.map((failure) => `${score.caseId}:${failure}`),
        ),
      ),
    ],
    coreIssueRecall: average(state.scores, "coreIssueRecall"),
    matchedRecall: average(state.scores, "matchedRecall"),
    falseSemanticAlignmentCount: sum("falseSemanticAlignmentCount"),
    unsupportedFalsePositiveCount: sum("unsupportedFalsePositiveCount"),
    typeAccuracy: average(state.scores, "typeAccuracy"),
    priorityAccuracy: average(state.scores, "priorityAccuracy"),
    directionLinkRate: average(state.scores, "directionLinkRate"),
    pasteReadyRewriteCount: sum("pasteReadyRewriteCount"),
    fabricatedFactCount: sum("fabricatedFactCount"),
    totalTokens:
      attempts.usage.inputCacheHitTokens +
      attempts.usage.inputCacheMissTokens +
      attempts.usage.outputTokens,
    costUsd: attempts.costUsd,
    latencyMs: attempts.latencyMs,
  };
}

function markdownReport(input: {
  model: string;
  winner: DifferencePromptVariant | null;
  calls: number;
  costUsd: number;
  candidates: DifferencePromptCandidateSummary[];
}) {
  return [
    "# Resume–JD Difference Prompt Evaluation",
    "",
    `- Model: ${input.model}`,
    `- Winner: ${input.winner ?? "none"}`,
    `- Calls: ${input.calls}`,
    `- Estimated cost: USD ${input.costUsd.toFixed(6)}`,
    "",
    "| Prompt | Eligible | Schema | Issue recall | False alignment | Type | Priority | Directions | Tokens | Cost USD |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...input.candidates.map((candidate) =>
      [
        candidate.variant,
        candidate.hardGateFailures.length === 0 &&
        candidate.schemaValidRate === 1 &&
        candidate.pasteReadyRewriteCount === 0 &&
        candidate.fabricatedFactCount === 0
          ? "yes"
          : "no",
        candidate.schemaValidRate.toFixed(3),
        candidate.coreIssueRecall.toFixed(3),
        String(candidate.falseSemanticAlignmentCount),
        candidate.typeAccuracy.toFixed(3),
        candidate.priorityAccuracy.toFixed(3),
        candidate.directionLinkRate.toFixed(3),
        String(candidate.totalTokens),
        candidate.costUsd.toFixed(6),
      ].join(" | ").replace(/^/u, "| ").replace(/$/u, " |"),
    ),
    "",
  ].join("\n");
}

export async function runResumeJDDifferenceEvaluationCli(
  options: ResumeJDDifferenceEvaluationCliOptions = {},
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((message) => console.log(message));
  const now = options.now ?? (() => new Date());
  const loadEnvironment =
    options.loadEnvironment ?? (() => void loadEnvConfig(cwd));
  const createProvider = options.createProvider ?? createDeepSeekAIProvider;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const parsedOptions = parseOptions(argv);
  const fixtures = await loadFixtures(cwd);
  const maxCalls = fixtures.length * parsedOptions.variants.length;
  if (maxCalls > RESUME_JD_DIFFERENCE_EVAL_MAX_CALLS) {
    throw new Error("resume-jd-difference-eval-call-cap-invalid");
  }
  writeOutput(
    `resume-jd-difference-eval-plan fixtures=${fixtures.length} prompts=${parsedOptions.variants.join(",")} max_calls=${maxCalls} max_cost_usd=${parsedOptions.maxCostUsd.toFixed(6)} max_output_tokens=${RESUME_JD_DIFFERENCE_EVAL_MAX_OUTPUT_TOKENS}`,
  );
  writeOutput(`fixtures=${fixtures.map(({ caseId }) => caseId).join(",")}`);
  if (parsedOptions.dryRun) return 0;

  loadEnvironment();
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("deepseek-api-key-missing");
  const model = env.AI_TEXT_MODEL?.trim() || "deepseek-v4-flash";
  const rawSchedule = env.AI_PRICE_SCHEDULE_JSON;
  if (!rawSchedule) {
    throw new Error("resume-jd-difference-eval-price-schedule-missing");
  }
  const schedule = parsePriceSchedule(rawSchedule);
  if (schedule.provider !== "deepseek" || schedule.model !== model) {
    throw new Error("resume-jd-difference-eval-price-schedule-model-mismatch");
  }

  const tracking = createTrackedFetch({
    fetchImpl,
    schedule,
    now,
    maxCalls,
    maxCostUsd: parsedOptions.maxCostUsd,
  });
  const provider = createProvider({
    apiKey,
    model,
    fetchImpl: tracking.trackedFetch,
    resumeJDDifferenceMaxTokens:
      RESUME_JD_DIFFERENCE_EVAL_MAX_OUTPUT_TOKENS,
  });
  const states = new Map<DifferencePromptVariant, CandidateState>(
    parsedOptions.variants.map((variant) => [
      variant,
      { scores: [], attempts: [] },
    ]),
  );
  const safeCases: Array<{
    caseId: string;
    variant: DifferencePromptVariant;
    statusCounts: Record<DifferenceIssueType, number> | null;
    errors: string[];
  }> = [];

  for (const fixture of fixtures) {
    for (const variant of parsedOptions.variants) {
      const start = tracking.attempts.length;
      let score: DifferenceCaseScore;
      let counts: Record<DifferenceIssueType, number> | null = null;
      try {
        const result = await provider.analyzeResumeJDDifference(
          {
            jdText: fixture.jdText,
            resumeText: fixture.resumeText,
            confirmedFacts: fixture.confirmedFacts,
          },
          { promptVariant: variant },
        );
        score = evaluateDifferenceCase(fixture, result.data);
        counts = statusCounts(result.data);
      } catch (error) {
        score = invalidCaseScore(fixture.caseId, safeError(error));
      }
      const state = states.get(variant)!;
      state.scores.push(score);
      state.attempts.push(...tracking.attempts.slice(start));
      safeCases.push({
        caseId: fixture.caseId,
        variant,
        statusCounts: counts,
        errors: score.hardGateFailures,
      });
    }
  }

  const candidates = parsedOptions.variants.map((variant) =>
    summarize(variant, states.get(variant)!),
  );
  let winner: DifferencePromptVariant | null = null;
  try {
    winner = selectDifferencePromptWinner(candidates).variant;
  } catch (error) {
    if (safeError(error) !== "resume-jd-difference-eval-no-eligible-prompt") {
      throw error;
    }
  }
  const budget = tracking.ledger.snapshot();
  const collectedAt = now().toISOString();
  const report = {
    model,
    collectedAt,
    fixtureCount: fixtures.length,
    prompts: parsedOptions.variants,
    limits: {
      maxCalls,
      maxCostUsd: parsedOptions.maxCostUsd,
      maxOutputTokens: RESUME_JD_DIFFERENCE_EVAL_MAX_OUTPUT_TOKENS,
    },
    actual: {
      calls: budget.callCount,
      costUsd: budget.actualCostUsd,
    },
    winner,
    candidates,
    cases: safeCases,
  };
  const directory = path.join(cwd, "tmp", "resume-jd-difference-eval");
  await mkdir(directory, { recursive: true });
  const stamp = collectedAt.replaceAll(":", "-");
  const jsonPath = path.join(directory, `${stamp}.json`);
  const markdownPath = path.join(directory, `${stamp}.md`);
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(
      markdownPath,
      markdownReport({
        model,
        winner,
        calls: budget.callCount,
        costUsd: budget.actualCostUsd,
        candidates,
      }),
      "utf8",
    ),
  ]);
  writeOutput(
    `resume-jd-difference-eval-complete calls=${budget.callCount} cost_usd=${budget.actualCostUsd.toFixed(6)} winner=${winner ?? "none"} report=${path.relative(cwd, jsonPath)}`,
  );
  return winner ? 0 : 2;
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  runResumeJDDifferenceEvaluationCli().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      console.error(safeError(error));
      process.exitCode = 1;
    },
  );
}
