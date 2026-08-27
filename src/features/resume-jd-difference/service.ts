import "server-only";

import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost } from "@/features/ai/pricing";
import type { AIProvider, AIUsage } from "@/features/extraction/provider";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import { extractResumeText, normalizeResumeText } from "@/features/source-assets/parsers";
import type { SourceAsset } from "@/features/source-assets/repository";
import { downloadSource } from "@/features/source-assets/storage";

import { buildDifferenceFingerprints, normalizeDocumentText } from "./hashes";
import {
  findExactExcerpt,
  verifyConfirmedFactIds,
} from "./policy";
import {
  differencePromptVariants,
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
const NO_EVIDENCE = "当前材料未找到相关证据";

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

function requireJDExcerpt(jdText: string, candidate: string) {
  const exact = findExactExcerpt(jdText, candidate);
  if (!exact) throw new Error("resume-jd-difference-evidence-invalid");
  return exact;
}

function strictConceptText(output: ResumeJDDifferenceOutput, issue: DifferenceIssue) {
  const concept = output.jobCore.concepts.find(({ id }) => id === issue.conceptId);
  if (!concept) return null;
  const text = `${concept.labelZh}\n${concept.originalTerms.join("\n")}`;
  const hasStrictLabel =
    /(?:工具|框架|云平台|方法|年限|语言|学历|学位|证书|执照|许可|管理范围|量化结果|数字)/u.test(
      text,
    );
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
  },
): ResumeJDDifferenceOutput {
  const parsed = resumeJDDifferenceOutputSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error("resume-jd-difference-invalid-output");
  }
  const initialGraph = validateResumeJDDifferenceGraph(parsed.data);
  if (!initialGraph.ok) {
    throw new Error("resume-jd-difference-invalid-output");
  }

  const output = structuredClone(parsed.data);
  for (const concept of output.jobCore.concepts) {
    for (const term of concept.originalTerms) requireJDExcerpt(context.jdText, term);
  }
  for (const gate of output.jobCore.gates) {
    gate.originalText = requireJDExcerpt(context.jdText, gate.originalText);
  }
  for (const item of output.jobCore.preferredItems) {
    item.originalText = requireJDExcerpt(context.jdText, item.originalText);
  }

  const factById = new Map(context.confirmedFacts.map((fact) => [fact.id, fact]));
  const authenticityByIssue = new Map<
    string,
    ImprovementDirection["authenticity"]
  >();

  output.issues = output.issues.map((issue) => {
    const next = { ...issue };
    next.jdOriginal = requireJDExcerpt(context.jdText, issue.jdOriginal);
    next.profileFactIds = verifyConfirmedFactIds(
      issue.profileFactIds,
      context.confirmedFacts,
    );

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
        next.resumeStatusZh =
          "职业档案有已确认相关事实，但当前对照简历中未找到可回查的表述。";
      } else {
        next.type = next.isGate ? "gate" : "missing";
        next.authenticity = "unsupported";
        next.resumeStatusZh = NO_EVIDENCE;
      }
    } else if (
      next.authenticity === "profile_only" &&
      next.profileFactIds.length === 0
    ) {
      next.type = next.isGate ? "gate" : "missing";
      next.authenticity = "unsupported";
      next.resumeStatusZh = NO_EVIDENCE;
    }

    authenticityByIssue.set(next.id, next.authenticity);
    return next;
  });

  output.matched = output.matched.map((item) => {
    const resumeExcerpt = findExactExcerpt(context.resumeText, item.resumeExcerpt);
    if (!resumeExcerpt) {
      throw new Error("resume-jd-difference-evidence-invalid");
    }
    return {
      ...item,
      jdOriginal: requireJDExcerpt(context.jdText, item.jdOriginal),
      resumeExcerpt,
      profileFactIds: verifyConfirmedFactIds(
        item.profileFactIds,
        context.confirmedFacts,
      ),
    };
  });

  output.directions = output.directions.map((direction) => {
    for (const term of direction.jdTerms) requireJDExcerpt(context.jdText, term);
    const issueAuthenticity = authenticityByIssue.get(direction.issueId);
    if (issueAuthenticity === "unsupported") {
      return unsupportedDirection(direction);
    }
    if (issueAuthenticity === "profile_only") {
      return {
        ...direction,
        authenticity: "profile_only" as const,
        needsConfirmation: true,
      };
    }
    return direction;
  });

  const final = resumeJDDifferenceOutputSchema.safeParse(output);
  if (!final.success || !validateResumeJDDifferenceGraph(final.data).ok) {
    throw new Error("resume-jd-difference-invalid-output");
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
  const promptVersion = differencePromptVariants[promptVariant].version;
  const clock = dependencies.clock ?? (() => new Date());

  return {
    async run(
      input: ResumeJDDifferenceServiceInput,
    ): Promise<ResumeJDDifferenceServiceResult> {
      assertOwnedInput(input);
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
          { promptVariant },
        );
        const result = verifyAndNormalizeDifferenceOutput(aiResult.data, {
          jdText,
          resumeText,
          confirmedFacts,
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
