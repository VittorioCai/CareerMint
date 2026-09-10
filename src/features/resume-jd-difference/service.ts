import "server-only";

import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost } from "@/features/ai/pricing";
import type { AIProvider, AIUsage } from "@/features/extraction/provider";
import type { ConfirmedFactForAnalysis } from "@/features/career-profile/confirmed-facts";
import { extractResumeText, normalizeResumeText } from "@/features/source-assets/parsers";
import type { SourceAsset } from "@/features/source-assets/repository";
import { downloadSource } from "@/features/source-assets/storage";
import type { AppLocale } from "@/i18n/locale";
import { dictionaryFor } from "@/i18n/dictionary";

import { buildDifferenceFingerprints, normalizeDocumentText } from "./hashes";
import {
  findExactExcerpt,
  verifyConfirmedFactIds,
} from "./policy";
import {
  differencePrompt,
  RESUME_JD_DIFFERENCE_POLICY_VERSION,
  RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
} from "./prompts";
import type { DifferencePromptVariant } from "./prompts";
import {
  toResumeJDDifferenceAIUsage,
  type ResumeJDDifferenceRun,
} from "./repository";
import {
  resumeJDDifferenceOutputSchema,
  validateResumeJDDifferenceGraph,
} from "./schemas";
import type {
  DifferenceIssue,
  ImprovementDirection,
  ResumeJDDifferenceOutput,
} from "./schemas";

const SAFE_ERROR_MESSAGE = "Resume and job difference analysis failed.";

/**
 * The two statuses the verifier writes itself, in the run's language.
 *
 * When the model claims resume evidence that is not actually in the resume,
 * the verifier overwrites `resumeStatus` — so those two sentences are ours,
 * not the model's, and they have to be in the language the rest of the run
 * is in. `noEvidence` is also the exact wording the prompt tells the model to
 * use, so the two must come from the same place or the same finding would be
 * phrased two ways in one document.
 */
function verifierStatuses(locale: AppLocale) {
  const dictionary = dictionaryFor(locale);
  return {
    noEvidence: dictionary.difference.noEvidence,
    profileOnly: dictionary.difference.profileOnlyStatus,
  };
}

function stagedFailure(code: string, failureStage: string) {
  const error = new Error(code) as Error & { failureStage: string };
  error.failureStage = failureStage;
  return error;
}

function safeOutputTokens(error: unknown) {
  if (!error || typeof error !== "object" || !("usage" in error)) return null;
  const usage = (error as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const tokens = (usage as { outputTokens?: unknown }).outputTokens;
  return typeof tokens === "number" && Number.isInteger(tokens) && tokens >= 0
    ? tokens
    : null;
}

function safeFailureStage(error: unknown) {
  if (!error || typeof error !== "object" || !("failureStage" in error)) {
    return null;
  }
  const value = (error as { failureStage?: unknown }).failureStage;
  return typeof value === "string" && /^[a-z0-9:-]{1,80}$/u.test(value)
    ? value
    : null;
}

type DifferenceRunRepository = {
  createOrGet(input: {
    applicationId: string;
    sourceAssetId: string;
    sourceFilename: string;
    sourceSha256: string;
    jdSha256: string;
    factFingerprint: string;
    inputHash: string;
    provider: string;
    model: string;
    schemaVersion: string;
    promptVersion: string;
    policyVersion: string;
    outputLocale: AppLocale;
  }): Promise<ResumeJDDifferenceRun>;
  claim(
    runId: string,
    expectedAttemptCount: number,
    expectedStatus: "queued" | "running" | "failed",
    leaseSeconds?: number,
  ): Promise<boolean>;
  getOwned(userId: string, runId: string): Promise<ResumeJDDifferenceRun | null>;
  complete(input: {
    runId: string;
    expectedAttemptCount: number;
    result: ResumeJDDifferenceOutput;
    aiUsage: ReturnType<typeof toResumeJDDifferenceAIUsage>;
    estimatedCostUsd: number | null;
  }): Promise<ResumeJDDifferenceRun>;
  fail(input: {
    runId: string;
    expectedAttemptCount: number;
    errorCode: string;
    errorMessage: string;
  }): Promise<ResumeJDDifferenceRun>;
};

type DifferenceLogger = {
  info?(event: string, metadata: Record<string, unknown>): void;
  error?(event: string, metadata: Record<string, unknown>): void;
};

export type ResumeJDDifferenceServiceDependencies = {
  runs: DifferenceRunRepository;
  storage?: { download(storagePath: string): Promise<Blob> };
  parser?: (buffer: Buffer, contentType: string) => Promise<string>;
  providerFactory(): Pick<AIProvider, "analyzeResumeJDDifference">;
  provider: string;
  model: string;
  promptVariant?: DifferencePromptVariant;
  priceSchedule?: AIPriceSchedule;
  clock?: () => Date;
  logger?: DifferenceLogger;
};

type ServiceFact = ConfirmedFactForAnalysis & {
  confirmationStatus?: string;
  sourceAssetId?: string | null;
};

export type ResumeJDDifferenceServiceInput = {
  userId: string;
  applicationId: string;
  /**
   * The language this analysis comes back in — the reader's, at the moment
   * they ask for it. It reaches the cache key through the prompt version, so
   * a run in one language is never served to a reader of the other, and
   * switching languages marks the existing analysis out of date rather than
   * showing it under the wrong headings.
   */
  outputLocale: AppLocale;
  jdText: string;
  asset: SourceAsset;
  confirmedFacts: ServiceFact[];
  ocrText?: string;
};

export type ResumeJDDifferenceServiceResult = {
  run: ResumeJDDifferenceRun;
  reused: boolean;
};

function safeIdentifier(value: string | null, maxLength: number) {
  if (value === null) return null;
  const candidate = value.trim();
  return candidate.length >= 1 &&
    candidate.length <= maxLength &&
    /^[A-Za-z0-9._:-]+$/u.test(candidate)
    ? candidate
    : null;
}

function mapFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (
    code === "deepseek-api-key-missing" ||
    code === "ai-provider-authentication-failed"
  ) {
    return {
      errorCode: "resume-jd-difference-unavailable",
      errorMessage: SAFE_ERROR_MESSAGE,
    };
  }

  const mapped: Record<string, string> = {
    "resume-text-too-short": "resume-text-insufficient",
    "resume-text-too-long": "resume-parse-failed",
    "unsupported-content-type": "resume-parse-failed",
    "resume-parse-failed": "resume-parse-failed",
    "source-download-failed": "source-download-failed",
    "ai-provider-timeout": "ai-timeout",
    "ai-provider-rate-limited": "ai-rate-limited",
    "ai-provider-request-failed": "ai-request-failed",
    "resume-jd-difference-invalid-output":
      "resume-jd-difference-invalid-output",
    "resume-jd-difference-evidence-invalid":
      "resume-jd-difference-evidence-invalid",
  };

  return {
    errorCode: mapped[code] ?? "resume-jd-difference-failed",
    errorMessage: SAFE_ERROR_MESSAGE,
  };
}

function assertOwnedInput(input: ResumeJDDifferenceServiceInput) {
  if (
    input.asset.userId !== input.userId ||
    (input.asset.status !== "uploaded" && input.asset.status !== "ready")
  ) {
    throw new Error("application-or-resume-not-found");
  }
}

function selectedConfirmedFacts(facts: ServiceFact[]) {
  return facts.filter(
    ({ confirmationStatus }) =>
      confirmationStatus === undefined || confirmationStatus === "confirmed",
  );
}

async function readResumeText(
  dependencies: ResumeJDDifferenceServiceDependencies,
  input: ResumeJDDifferenceServiceInput,
) {
  if (input.ocrText !== undefined) return normalizeResumeText(input.ocrText);

  const storage = dependencies.storage ?? { download: downloadSource };
  const parser = dependencies.parser ?? extractResumeText;
  let source: Blob;
  try {
    source = await storage.download(input.asset.storagePath);
  } catch {
    throw new Error("source-download-failed");
  }

  try {
    const text = await parser(
      Buffer.from(await source.arrayBuffer()),
      input.asset.contentType,
    );
    return normalizeResumeText(text);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (
      code === "resume-text-too-short" ||
      code === "resume-text-too-long" ||
      code === "unsupported-content-type"
    ) {
      throw error;
    }
    throw new Error("resume-parse-failed");
  }
}

function requireJDExcerpt(
  jdText: string,
  candidate: string,
  section: "concept" | "gate" | "preferred" | "issue" | "matched" | "direction",
) {
  const exact = findExactExcerpt(jdText, candidate);
  if (!exact) {
    throw stagedFailure(
      "resume-jd-difference-evidence-invalid",
      `evidence-jd:${section}`,
    );
  }
  return exact;
}

function boundedDerivedTerm(sourceExcerpt: string) {
  if (sourceExcerpt.length <= 160) return sourceExcerpt;
  const wordBoundary = sourceExcerpt.lastIndexOf(" ", 160);
  const end = wordBoundary >= 80 ? wordBoundary : 160;
  return sourceExcerpt.slice(0, end).trim();
}

function verifiedDerivedTerms(input: {
  jdText: string;
  candidates: string[];
  fallbackExcerpt: string | null;
  section: "concept" | "direction";
}) {
  const exact = [
    ...new Set(
      input.candidates.flatMap((candidate) => {
        const excerpt = findExactExcerpt(input.jdText, candidate);
        return excerpt ? [excerpt] : [];
      }),
    ),
  ];
  if (exact.length > 0) return exact;
  if (!input.fallbackExcerpt) {
    requireJDExcerpt(input.jdText, input.candidates[0] ?? "", input.section);
  }
  return [
    requireJDExcerpt(
      input.jdText,
      boundedDerivedTerm(input.fallbackExcerpt ?? ""),
      input.section,
    ),
  ];
}

/**
 * Concept labels that mean "this needs literal evidence, not a paraphrase".
 *
 * The model writes the label in the output language, so the list has to cover
 * both. English was missing entirely, which meant an English run treated
 * every concept as semantically matchable — a certificate or a language level
 * would have passed on an adjacent tool.
 */
const STRICT_CONCEPT_LABEL =
  /(?:工具|框架|云平台|方法|年限|语言|学历|学位|证书|执照|许可|管理范围|量化结果|数字)|\b(?:tool|tooling|framework|cloud|platform|method|methodology|years?|language|degree|education|certificat|licen[cs]e|permit|authorization|authorisation|headcount|team size|scope|metric|quantif|number)/iu;

function strictConceptText(output: ResumeJDDifferenceOutput, issue: DifferenceIssue) {
  const concept = output.jobCore.concepts.find(({ id }) => id === issue.conceptId);
  if (!concept) return null;
  const text = `${concept.label}\n${concept.originalTerms.join("\n")}`;
  const hasStrictLabel = STRICT_CONCEPT_LABEL.test(text);
  const hasStrictValue = concept.originalTerms.some(
    (term) =>
      /\d/u.test(term) ||
      /^[A-Z][A-Z0-9+#.-]{1,11}$/u.test(term.trim()) ||
      /\b(?:A1|A2|B1|B2|C1|C2)\b/u.test(term),
  );
  return hasStrictLabel || hasStrictValue ? concept.originalTerms : null;
}

function factSupportsStrictTerms(
  fact: ConfirmedFactForAnalysis,
  strictTerms: string[],
) {
  const source = [
    fact.title,
    fact.organization ?? "",
    fact.description,
    ...fact.skills,
    fact.sourceExcerpt ?? "",
  ].join("\n");
  return strictTerms.some((term) => findExactExcerpt(source, term) !== null);
}

function unsupportedDirection(direction: ImprovementDirection) {
  return {
    ...direction,
    synonymousJobLanguage: [],
    authenticity: "unsupported" as const,
    needsConfirmation: true,
  };
}

export function verifyAndNormalizeDifferenceOutput(
  candidate: unknown,
  context: {
    jdText: string;
    resumeText: string;
    confirmedFacts: ConfirmedFactForAnalysis[];
    outputLocale: AppLocale;
  },
): ResumeJDDifferenceOutput {
  const statuses = verifierStatuses(context.outputLocale);
  const parsed = resumeJDDifferenceOutputSchema.safeParse(candidate);
  if (!parsed.success) {
    throw stagedFailure(
      "resume-jd-difference-invalid-output",
      "output-schema",
    );
  }
  const initialGraph = validateResumeJDDifferenceGraph(parsed.data);
  if (!initialGraph.ok) {
    throw stagedFailure(
      "resume-jd-difference-invalid-output",
      `graph-initial:${initialGraph.code}`,
    );
  }

  const output = structuredClone(parsed.data);
  for (const gate of output.jobCore.gates) {
    gate.originalText = requireJDExcerpt(
      context.jdText,
      gate.originalText,
      "gate",
    );
  }
  for (const item of output.jobCore.preferredItems) {
    item.originalText = requireJDExcerpt(
      context.jdText,
      item.originalText,
      "preferred",
    );
  }

  const factById = new Map(context.confirmedFacts.map((fact) => [fact.id, fact]));
  const authenticityByIssue = new Map<
    string,
    ImprovementDirection["authenticity"]
  >();

  output.issues = output.issues.map((issue) => {
    const next = { ...issue };
    next.jdOriginal = requireJDExcerpt(
      context.jdText,
      issue.jdOriginal,
      "issue",
    );
    next.profileFactIds = verifyConfirmedFactIds(
      issue.profileFactIds,
      context.confirmedFacts,
    );

    return next;
  });

  output.matched = output.matched.map((item) => {
    const resumeExcerpt = findExactExcerpt(context.resumeText, item.resumeExcerpt);
    if (!resumeExcerpt) {
      throw stagedFailure(
        "resume-jd-difference-evidence-invalid",
        "evidence-resume",
      );
    }
    return {
      ...item,
      jdOriginal: requireJDExcerpt(
        context.jdText,
        item.jdOriginal,
        "matched",
      ),
      resumeExcerpt,
      profileFactIds: verifyConfirmedFactIds(
        item.profileFactIds,
        context.confirmedFacts,
      ),
    };
  });

  output.jobCore.concepts = output.jobCore.concepts.map((concept) => {
    const fallbackExcerpt =
      output.issues.find((issue) => issue.conceptId === concept.id)?.jdOriginal ??
      output.matched.find((item) => item.conceptId === concept.id)?.jdOriginal ??
      null;
    return {
      ...concept,
      originalTerms: verifiedDerivedTerms({
        jdText: context.jdText,
        candidates: concept.originalTerms,
        fallbackExcerpt,
        section: "concept",
      }),
    };
  });

  output.issues = output.issues.map((issue) => {
    const next = { ...issue };

    const strictTerms = strictConceptText(output, next);
    if (strictTerms) {
      next.profileFactIds = next.profileFactIds.filter((id) => {
        const fact = factById.get(id);
        return fact ? factSupportsStrictTerms(fact, strictTerms) : false;
      });
    }

    const exactResume = issue.resumeExcerpt
      ? findExactExcerpt(context.resumeText, issue.resumeExcerpt)
      : null;
    if (issue.resumeExcerpt && exactResume) next.resumeExcerpt = exactResume;

    const strictMismatch =
      strictTerms !== null &&
      next.authenticity === "supported" &&
      (!exactResume ||
        !strictTerms.some(
          (term) => findExactExcerpt(exactResume, term) !== null,
        ));

    if ((issue.resumeExcerpt && !exactResume) || strictMismatch) {
      if (!strictMismatch) next.resumeExcerpt = null;
      if (next.profileFactIds.length > 0) {
        next.type = next.isGate ? "gate" : "profile_only";
        next.authenticity = "profile_only";
        next.resumeStatus = statuses.profileOnly;
      } else {
        next.type = next.isGate ? "gate" : "missing";
        next.authenticity = "unsupported";
        next.resumeStatus = statuses.noEvidence;
      }
    } else if (
      next.authenticity === "profile_only" &&
      next.profileFactIds.length === 0
    ) {
      next.type = next.isGate ? "gate" : "missing";
      next.authenticity = "unsupported";
      next.resumeStatus = statuses.noEvidence;
    }

    authenticityByIssue.set(next.id, next.authenticity);
    return next;
  });

  output.directions = output.directions.map((direction) => {
    const linkedIssue = output.issues.find(({ id }) => id === direction.issueId);
    const linkedConcept = output.jobCore.concepts.find(
      ({ id }) => id === direction.conceptId,
    );
    const next = {
      ...direction,
      jdTerms: verifiedDerivedTerms({
        jdText: context.jdText,
        candidates: direction.jdTerms,
        fallbackExcerpt:
          linkedConcept?.originalTerms[0] ?? linkedIssue?.jdOriginal ?? null,
        section: "direction",
      }),
    };
    const issueAuthenticity = authenticityByIssue.get(direction.issueId);
    if (issueAuthenticity === "unsupported") {
      return unsupportedDirection(next);
    }
    if (issueAuthenticity === "profile_only") {
      return {
        ...next,
        authenticity: "profile_only" as const,
        needsConfirmation: true,
      };
    }
    return next;
  });

  const final = resumeJDDifferenceOutputSchema.safeParse(output);
  if (!final.success) {
    throw stagedFailure(
      "resume-jd-difference-invalid-output",
      "output-final-schema",
    );
  }
  const finalGraph = validateResumeJDDifferenceGraph(final.data);
  if (!finalGraph.ok) {
    throw stagedFailure(
      "resume-jd-difference-invalid-output",
      `graph-final:${finalGraph.code}`,
    );
  }
  return final.data;
}

function safeAIMetadata(input: {
  provider: string;
  model: string;
  requestId: string | null;
  usage: AIUsage;
  expectedProvider: string;
  expectedModel: string;
  schedule?: AIPriceSchedule;
  at: Date;
}) {
  if (
    input.provider !== input.expectedProvider ||
    input.model !== input.expectedModel
  ) {
    throw new Error("resume-jd-difference-failed");
  }

  const schedule =
    input.schedule?.provider === input.provider &&
    input.schedule.model === input.model
      ? input.schedule
      : undefined;
  const scheduleVersion = schedule
    ? safeIdentifier(schedule.version, 80)
    : null;
  const estimated =
    schedule && scheduleVersion
      ? estimateAITextCost(input.usage, schedule, input.at)
      : null;
  const aiUsage = toResumeJDDifferenceAIUsage({
    provider: input.provider,
    model: input.model,
    requestId: safeIdentifier(input.requestId, 200),
    usage: input.usage,
    priceScheduleVersion: estimated ? scheduleVersion : null,
  });
  return {
    aiUsage,
    estimatedCostUsd: estimated ? estimated.amount : null,
  };
}

async function recoverCurrent(
  runs: DifferenceRunRepository,
  userId: string,
  runId: string,
  expectedAttemptCount: number,
) {
  const current = await runs.getOwned(userId, runId);
  return current &&
    (current.status === "succeeded" ||
      current.status === "failed" ||
      current.attemptCount !== expectedAttemptCount)
    ? current
    : null;
}

export function createResumeJDDifferenceService(
  dependencies: ResumeJDDifferenceServiceDependencies,
) {
  const promptVariant = dependencies.promptVariant ?? "p1";
  const clock = dependencies.clock ?? (() => new Date());

  return {
    async run(
      input: ResumeJDDifferenceServiceInput,
    ): Promise<ResumeJDDifferenceServiceResult> {
      assertOwnedInput(input);
      const outputLocale = input.outputLocale;
      const promptVersion = differencePrompt(promptVariant, outputLocale).version;
      const jdText = normalizeDocumentText(input.jdText);
      if (!jdText) throw new Error("job-description-required");
      const confirmedFacts = selectedConfirmedFacts(input.confirmedFacts);
      const fingerprints = buildDifferenceFingerprints({
        jdText,
        sourceSha256: input.asset.sha256,
        confirmedFacts,
        provider: dependencies.provider,
        model: dependencies.model,
        promptVersion,
        schemaVersion: RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
        policyVersion: RESUME_JD_DIFFERENCE_POLICY_VERSION,
      });
      const run = await dependencies.runs.createOrGet({
        applicationId: input.applicationId,
        sourceAssetId: input.asset.id,
        sourceFilename: input.asset.originalName,
        sourceSha256: input.asset.sha256,
        ...fingerprints,
        provider: dependencies.provider,
        model: dependencies.model,
        schemaVersion: RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
        promptVersion,
        policyVersion: RESUME_JD_DIFFERENCE_POLICY_VERSION,
        outputLocale,
      });
      if (run.status === "succeeded") return { run, reused: true };

      const expectedAttemptCount = run.attemptCount + 1;
      const claimed = await dependencies.runs.claim(
        run.id,
        run.attemptCount,
        run.status,
        120,
      );
      if (!claimed) {
        const current = await dependencies.runs.getOwned(input.userId, run.id);
        if (!current) throw new Error("application-or-resume-not-found");
        return { run: current, reused: true };
      }

      const claimedRun = await dependencies.runs.getOwned(input.userId, run.id);
      if (!claimedRun) throw new Error("application-or-resume-not-found");
      if (
        claimedRun.status !== "running" ||
        claimedRun.attemptCount !== expectedAttemptCount
      ) {
        return { run: claimedRun, reused: true };
      }

      try {
        const resumeText = await readResumeText(dependencies, input);
        const provider = dependencies.providerFactory();
        const aiResult = await provider.analyzeResumeJDDifference(
          { jdText, resumeText, confirmedFacts },
          { promptVariant, outputLocale },
        );
        const result = verifyAndNormalizeDifferenceOutput(aiResult.data, {
          jdText,
          resumeText,
          confirmedFacts,
          outputLocale,
        });
        const metadata = safeAIMetadata({
          ...aiResult,
          expectedProvider: claimedRun.provider,
          expectedModel: claimedRun.model,
          schedule: dependencies.priceSchedule,
          at: clock(),
        });
        try {
          const completed = await dependencies.runs.complete({
            runId: run.id,
            expectedAttemptCount,
            result,
            ...metadata,
          });
          dependencies.logger?.info?.("resume-jd-difference-completed", {
            runId: run.id,
            promptVersion,
            schemaVersion: RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
            policyVersion: RESUME_JD_DIFFERENCE_POLICY_VERSION,
            ...metadata.aiUsage.usage,
          });
          return { run: completed, reused: false };
        } catch {
          const recovered = await recoverCurrent(
            dependencies.runs,
            input.userId,
            run.id,
            expectedAttemptCount,
          );
          if (recovered) return { run: recovered, reused: true };
          throw new Error("resume-jd-difference-failed");
        }
      } catch (error) {
        const safe = mapFailure(error);
        try {
          const failed = await dependencies.runs.fail({
            runId: run.id,
            expectedAttemptCount,
            ...safe,
          });
          dependencies.logger?.error?.("resume-jd-difference-failed", {
            runId: run.id,
            promptVersion,
            schemaVersion: RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
            policyVersion: RESUME_JD_DIFFERENCE_POLICY_VERSION,
            errorCode: safe.errorCode,
            failureStage: safeFailureStage(error),
            outputTokens: safeOutputTokens(error),
          });
          return { run: failed, reused: false };
        } catch {
          const recovered = await recoverCurrent(
            dependencies.runs,
            input.userId,
            run.id,
            expectedAttemptCount,
          );
          if (recovered) return { run: recovered, reused: true };
          throw new Error("resume-jd-difference-failed");
        }
      }
    },
  };
}
