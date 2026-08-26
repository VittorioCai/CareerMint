import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost } from "@/features/ai/pricing";
import type { AIProvider } from "@/features/extraction/provider";

import type { JDStructureRun } from "./structure-repository";
import { sanitizeJDStructureOutput } from "./sanitizers";
import { aiMetadataSchema, estimatedCostSchema } from "./schemas";
import type {
  AIMetadata,
  EstimatedCost,
  JDStructureProviderOutput,
} from "./schemas";

const SAFE_ERROR_MESSAGE = "JD analysis failed.";
const SAFE_ERROR_CODES = new Set([
  "jd-structure-invalid-output",
  "jd-gap-invalid-output",
  "resume-text-too-short",
  "resume-text-too-long",
  "unsupported-content-type",
  "source-download-failed",
  "ai-provider-rate-limited",
  "ai-provider-request-failed",
  "ai-provider-timeout",
]);

type StructureRepository = {
  claim(
    runId: string,
    expectedAttemptCount: number,
    expectedStatus: "queued" | "running" | "failed",
    leaseSeconds?: number,
  ): Promise<boolean>;
  getOwned(userId: string, runId: string): Promise<JDStructureRun | null>;
  complete(input: {
    runId: string;
    expectedAttemptCount: number;
    output: JDStructureProviderOutput;
    ai: AIMetadata;
    estimatedCost: EstimatedCost | null;
  }): Promise<JDStructureRun>;
  fail(input: {
    runId: string;
    expectedAttemptCount: number;
    errorCode: string;
    errorMessage: string;
  }): Promise<JDStructureRun>;
};

export type JDStructureServiceDependencies = {
  runs: StructureRepository;
  providerFactory(): Pick<AIProvider, "structureJobDescription">;
  priceSchedule?: AIPriceSchedule;
  clock?: () => Date;
};

export type JDStructureServiceResult = { run: JDStructureRun; reused: boolean };

function safeIdentifier(value: string | null, max: number) {
  if (value === null) return null;
  const candidate = value.trim();
  return candidate.length >= 1 && candidate.length <= max && /^[A-Za-z0-9._:-]+$/u.test(candidate)
    ? candidate
    : null;
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "deepseek-api-key-missing" || code === "ai-provider-authentication-failed") {
    return { errorCode: "jd-gap-unavailable", errorMessage: SAFE_ERROR_MESSAGE };
  }
  return {
    errorCode: SAFE_ERROR_CODES.has(code) ? code : "jd-gap-failed",
    errorMessage: SAFE_ERROR_MESSAGE,
  };
}

function metadata(input: {
  provider: string;
  model: string;
  requestId: string | null;
  usage: import("@/features/extraction/provider").AIUsage;
  expectedProvider: string;
  expectedModel: string;
  schedule?: AIPriceSchedule;
  at: Date;
}) {
  if (input.provider !== input.expectedProvider || input.model !== input.expectedModel) {
    throw new Error("jd-gap-failed");
  }
  const schedule = input.schedule?.provider === input.provider &&
      input.schedule.model === input.model
    ? input.schedule
    : undefined;
  const scheduleVersion = schedule ? safeIdentifier(schedule.version, 80) : null;
  const estimated = schedule && scheduleVersion
    ? estimateAITextCost(input.usage, schedule, input.at)
    : null;
  const estimatedCost = estimated && scheduleVersion
    ? estimatedCostSchema.parse({ ...estimated, scheduleVersion })
    : null;
  const ai = aiMetadataSchema.parse({
    provider: input.provider,
    model: input.model,
    requestId: safeIdentifier(input.requestId, 200),
    usage: input.usage,
    priceScheduleVersion: estimatedCost ? scheduleVersion : null,
  });
  return { ai, estimatedCost };
}

function assertOwned(input: {
  userId: string;
  run: JDStructureRun;
  application: { id: string; userId: string; jdText: string };
}) {
  if (
    input.run.userId !== input.userId ||
    input.application.userId !== input.userId ||
    input.run.applicationId !== input.application.id
  ) {
    throw new Error("application-not-found");
  }
}

async function recoverCurrent(
  runs: StructureRepository,
  userId: string,
  runId: string,
  expectedAttemptCount: number,
) {
  const current = await runs.getOwned(userId, runId);
  return current && (
    current.status === "succeeded" ||
    current.status === "failed" ||
    current.attemptCount !== expectedAttemptCount
  )
    ? current
    : null;
}

export function createJDStructureService(
  dependencies: JDStructureServiceDependencies,
) {
  const clock = dependencies.clock ?? (() => new Date());

  return {
    async run(input: {
      userId: string;
      run: JDStructureRun;
      application: { id: string; userId: string; jdText: string };
    }): Promise<JDStructureServiceResult> {
      assertOwned(input);
      if (input.run.status === "succeeded") {
        return { run: input.run, reused: true };
      }

      const expectedAttemptCount = input.run.attemptCount + 1;
      const claimed = await dependencies.runs.claim(
        input.run.id,
        input.run.attemptCount,
        input.run.status,
        120,
      );
      if (!claimed) {
        const current = await dependencies.runs.getOwned(input.userId, input.run.id);
        if (!current) throw new Error("application-not-found");
        return { run: current, reused: true };
      }

      const claimedRun = await dependencies.runs.getOwned(input.userId, input.run.id);
      if (!claimedRun) throw new Error("application-not-found");
      if (
        claimedRun.status !== "running" ||
        claimedRun.attemptCount !== expectedAttemptCount
      ) {
        return { run: claimedRun, reused: true };
      }

      try {
        const provider = dependencies.providerFactory();
        const aiResult = await provider.structureJobDescription({
          jdText: input.application.jdText,
        });
        const output = sanitizeJDStructureOutput({
          jdText: input.application.jdText,
          output: aiResult.data,
        });
        const safe = metadata({
          ...aiResult,
          expectedProvider: claimedRun.provider,
          expectedModel: claimedRun.model,
          schedule: dependencies.priceSchedule,
          at: clock(),
        });
        try {
          const completed = await dependencies.runs.complete({
            runId: input.run.id,
            expectedAttemptCount,
            output,
            ...safe,
          });
          return { run: completed, reused: false };
        } catch {
          const recovered = await recoverCurrent(
            dependencies.runs,
            input.userId,
            input.run.id,
            expectedAttemptCount,
          );
          if (recovered) return { run: recovered, reused: true };
          throw new Error("jd-gap-failed");
        }
      } catch (error) {
        const safe = failure(error);
        try {
          const failed = await dependencies.runs.fail({
            runId: input.run.id,
            expectedAttemptCount,
            ...safe,
          });
          return { run: failed, reused: false };
        } catch {
          const recovered = await recoverCurrent(
            dependencies.runs,
            input.userId,
            input.run.id,
            expectedAttemptCount,
          );
          if (recovered) return { run: recovered, reused: true };
          throw new Error("jd-gap-failed");
        }
      }
    },
  };
}
