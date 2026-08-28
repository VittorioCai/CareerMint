import { z } from "zod";

import { normalizeForMatching } from "@/features/extraction/evidence";
import { confirmedFactForAnalysisSchema } from "@/features/jd-analysis/schemas";

import { isPasteReadyRewrite } from "./policy";
import type { DifferencePromptVariant } from "./prompts";
import {
  authenticitySchema,
  differenceIssueTypeSchema,
  differencePrioritySchema,
  resumeJDDifferenceOutputSchema,
  validateResumeJDDifferenceGraph,
  type DifferenceIssue,
  type ResumeJDDifferenceOutput,
} from "./schemas";

export const RESUME_JD_DIFFERENCE_EVAL_MAX_CALLS = 18;
export const RESUME_JD_DIFFERENCE_EVAL_MAX_COST_USD = 1;
export const RESUME_JD_DIFFERENCE_EVAL_MAX_OUTPUT_TOKENS = 4096;

const fixtureLabelSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/u);

const fixtureNeedlesSchema = z.array(z.string().trim().min(2).max(240)).min(1).max(6);

const expectedIssueSchema = z
  .object({
    label: fixtureLabelSchema,
    jdNeedles: fixtureNeedlesSchema,
    type: differenceIssueTypeSchema,
    priority: differencePrioritySchema,
    authenticity: authenticitySchema,
    isGate: z.boolean(),
  })
  .strict();

const expectedMatchedSchema = z
  .object({
    label: fixtureLabelSchema,
    jdNeedles: fixtureNeedlesSchema,
  })
  .strict();

export const differenceEvaluationFixtureSchema = z
  .object({
    caseId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/u),
    jdText: z.string().trim().min(20).max(12_000),
    resumeText: z.string().trim().min(20).max(12_000),
    confirmedFacts: z.array(confirmedFactForAnalysisSchema).max(12),
    expected: z
      .object({
        issues: z.array(expectedIssueSchema).min(1).max(16),
        matched: z.array(expectedMatchedSchema).max(12).default([]),
      })
      .strict(),
  })
  .strict()
  .superRefine((fixture, context) => {
    const labels = [
      ...fixture.expected.issues.map(({ label }) => label),
      ...fixture.expected.matched.map(({ label }) => label),
    ];
    if (new Set(labels).size !== labels.length) {
      context.addIssue({
        code: "custom",
        path: ["expected"],
        message: "Evaluation labels must be unique.",
      });
    }
    if (Buffer.byteLength(JSON.stringify(fixture), "utf8") >= 30_000) {
      context.addIssue({
        code: "custom",
        message: "A complete evaluation fixture must be smaller than 30,000 bytes.",
      });
    }
    if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u.test(JSON.stringify(fixture))) {
      context.addIssue({
        code: "custom",
        message: "Evaluation fixtures must not contain email addresses.",
      });
    }
  });

export type DifferenceEvaluationFixture = z.infer<
  typeof differenceEvaluationFixtureSchema
>;

export type DifferenceCaseScore = {
  caseId: string;
  schemaValid: boolean;
  hardGateFailures: string[];
  coreIssueRecall: number;
  matchedRecall: number;
  falseSemanticAlignmentCount: number;
  unsupportedFalsePositiveCount: number;
  typeAccuracy: number;
  priorityAccuracy: number;
  directionLinkRate: number;
  pasteReadyRewriteCount: number;
  fabricatedFactCount: number;
};

function includesNeedle(text: string, needles: readonly string[]) {
  const normalized = normalizeForMatching(text);
  return needles.some((needle) =>
    normalized.includes(normalizeForMatching(needle)),
  );
}

function findIssue(
  output: ResumeJDDifferenceOutput,
  needles: readonly string[],
) {
  return output.issues.find((issue) => includesNeedle(issue.jdOriginal, needles));
}

function findMatched(
  output: ResumeJDDifferenceOutput,
  needles: readonly string[],
) {
  return output.matched.find((item) => includesNeedle(item.jdOriginal, needles));
}

function exactExcerptExists(document: string, excerpt: string) {
  return normalizeForMatching(document).includes(normalizeForMatching(excerpt));
}

function countFabricatedFacts(
  fixture: DifferenceEvaluationFixture,
  output: ResumeJDDifferenceOutput,
) {
  const confirmedFactIds = new Set(fixture.confirmedFacts.map(({ id }) => id));
  let count = 0;
  for (const item of [...output.issues, ...output.matched]) {
    if (item.resumeExcerpt && !exactExcerptExists(fixture.resumeText, item.resumeExcerpt)) {
      count += 1;
    }
    count += item.profileFactIds.filter((id) => !confirmedFactIds.has(id)).length;
  }
  return count;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function evaluateDifferenceCase(
  rawFixture: DifferenceEvaluationFixture,
  candidate: unknown,
): DifferenceCaseScore {
  const fixture = differenceEvaluationFixtureSchema.parse(rawFixture);
  const parsed = resumeJDDifferenceOutputSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      caseId: fixture.caseId,
      schemaValid: false,
      hardGateFailures: ["schema-invalid"],
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

  const output = parsed.data;
  const failures: string[] = [];
  if (!validateResumeJDDifferenceGraph(output).ok) failures.push("graph-invalid");

  let foundIssues = 0;
  let exactTypes = 0;
  let exactPriorities = 0;
  let falseSemanticAlignmentCount = 0;
  let unsupportedFalsePositiveCount = 0;
  for (const expected of fixture.expected.issues) {
    const issue = findIssue(output, expected.jdNeedles);
    const matched = findMatched(output, expected.jdNeedles);
    if (issue) {
      foundIssues += 1;
      if (issue.type === expected.type && issue.isGate === expected.isGate) {
        exactTypes += 1;
      }
      if (issue.priority === expected.priority) exactPriorities += 1;
      if (
        expected.authenticity === "unsupported" &&
        issue.authenticity !== "unsupported"
      ) {
        unsupportedFalsePositiveCount += 1;
      }
    }
    if (matched) {
      falseSemanticAlignmentCount += 1;
      if (expected.authenticity === "unsupported") {
        unsupportedFalsePositiveCount += 1;
      }
    }
  }

  const foundMatched = fixture.expected.matched.filter((expected) =>
    findMatched(output, expected.jdNeedles),
  ).length;
  const nonGateIssues = output.issues.filter((issue) => !issue.isGate);
  const directionIssueIds = new Set(output.directions.map(({ issueId }) => issueId));
  const directionLinkRate =
    nonGateIssues.length === 0
      ? fixture.expected.issues.some(({ isGate }) => !isGate)
        ? 0
        : 1
      : nonGateIssues.filter(({ id }) => directionIssueIds.has(id)).length /
        nonGateIssues.length;
  const pasteReadyRewriteCount = output.directions.filter((direction) =>
    isPasteReadyRewrite(direction.directionZh),
  ).length;
  const fabricatedFactCount = countFabricatedFacts(fixture, output);
  if (pasteReadyRewriteCount > 0) failures.push("paste-ready-rewrite");
  if (fabricatedFactCount > 0) failures.push("fabricated-fact");

  const issueCount = fixture.expected.issues.length;
  return {
    caseId: fixture.caseId,
    schemaValid: true,
    hardGateFailures: unique(failures),
    coreIssueRecall: foundIssues / issueCount,
    matchedRecall:
      fixture.expected.matched.length === 0
        ? 1
        : foundMatched / fixture.expected.matched.length,
    falseSemanticAlignmentCount,
    unsupportedFalsePositiveCount,
    typeAccuracy: exactTypes / issueCount,
    priorityAccuracy: exactPriorities / issueCount,
    directionLinkRate,
    pasteReadyRewriteCount,
    fabricatedFactCount,
  };
}

export type DifferencePromptCandidateSummary = {
  variant: DifferencePromptVariant;
  promptVersion: string;
  schemaValidRate: number;
  hardGateFailures: string[];
  coreIssueRecall: number;
  matchedRecall: number;
  falseSemanticAlignmentCount: number;
  unsupportedFalsePositiveCount: number;
  typeAccuracy: number;
  priorityAccuracy: number;
  directionLinkRate: number;
  pasteReadyRewriteCount: number;
  fabricatedFactCount: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
};

export function selectDifferencePromptWinner(
  candidates: readonly DifferencePromptCandidateSummary[],
) {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.schemaValidRate === 1 &&
      candidate.pasteReadyRewriteCount === 0 &&
      candidate.fabricatedFactCount === 0 &&
      candidate.hardGateFailures.length === 0,
  );
  if (eligible.length === 0) {
    throw new Error("resume-jd-difference-eval-no-eligible-prompt");
  }
  return [...eligible].sort(
    (left, right) =>
      left.falseSemanticAlignmentCount - right.falseSemanticAlignmentCount ||
      left.unsupportedFalsePositiveCount - right.unsupportedFalsePositiveCount ||
      right.coreIssueRecall - left.coreIssueRecall ||
      right.typeAccuracy - left.typeAccuracy ||
      right.priorityAccuracy - left.priorityAccuracy ||
      right.directionLinkRate - left.directionLinkRate ||
      right.matchedRecall - left.matchedRecall ||
      left.totalTokens - right.totalTokens ||
      left.costUsd - right.costUsd ||
      left.latencyMs - right.latencyMs ||
      left.variant.localeCompare(right.variant),
  )[0]!;
}

export function createDifferenceEvaluationBudgetLedger(input: {
  inputCacheMissPerMillion: number;
  outputPerMillion: number;
  maxCalls?: number;
  maxCostUsd?: number;
}) {
  const maxCalls = input.maxCalls ?? RESUME_JD_DIFFERENCE_EVAL_MAX_CALLS;
  const maxCostUsd = input.maxCostUsd ?? RESUME_JD_DIFFERENCE_EVAL_MAX_COST_USD;
  let callCount = 0;
  let actualCostUsd = 0;
  return {
    reserve(request: { requestBytes: number; maxOutputTokens?: number }) {
      if (callCount >= maxCalls) {
        throw new Error("resume-jd-difference-eval-call-cap-exceeded");
      }
      const maxOutputTokens =
        request.maxOutputTokens ?? RESUME_JD_DIFFERENCE_EVAL_MAX_OUTPUT_TOKENS;
      const reservedCostUsd =
        (request.requestBytes * input.inputCacheMissPerMillion +
          maxOutputTokens * input.outputPerMillion) /
        1_000_000;
      if (actualCostUsd + reservedCostUsd > maxCostUsd) {
        throw new Error("resume-jd-difference-eval-cost-cap-exceeded");
      }
      callCount += 1;
      return { callNumber: callCount, reservedCostUsd };
    },
    recordActualCost(amount: number) {
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("resume-jd-difference-eval-invalid-cost");
      }
      actualCostUsd += amount;
      if (actualCostUsd > maxCostUsd) {
        throw new Error("resume-jd-difference-eval-cost-cap-exceeded");
      }
    },
    snapshot() {
      return { callCount, actualCostUsd, maxCalls, maxCostUsd };
    },
  };
}

export function statusCounts(output: ResumeJDDifferenceOutput) {
  return output.issues.reduce<Record<DifferenceIssue["type"], number>>(
    (counts, issue) => {
      counts[issue.type] += 1;
      return counts;
    },
    {
      missing: 0,
      language_misaligned: 0,
      profile_only: 0,
      skill_only: 0,
      too_vague: 0,
      missing_context: 0,
      missing_result: 0,
      needs_confirmation: 0,
      gate: 0,
    },
  );
}
