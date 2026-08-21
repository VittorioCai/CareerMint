import type { AIPriceSchedule } from "@/features/ai/pricing";
import { estimateAITextCost } from "@/features/ai/pricing";
import type {
  FailJobInput,
  ProcessingJob,
  SucceedJobInput,
} from "@/features/jobs/repository";

import { verifyCandidateEvidence } from "./evidence";
import type { AIProvider, AIUsage } from "./provider";
import type { ExtractedFact } from "./schemas";

export type { ExtractedFact } from "./schemas";

export type ResumeExtractionAsset = {
  id: string;
  userId: string;
  originalName: string;
  contentType: string;
  storagePath: string;
};

export type ResumeExtractionJobResult = {
  acceptedCount: number;
  rejectedCount: number;
  ai: {
    provider: string;
    model: string;
    requestId: string | null;
    usage: AIUsage;
    priceScheduleVersion: string | null;
  };
  estimatedCost: ReturnType<typeof estimateAITextCost>;
};

type JobRepository = {
  claimJob(jobId: string): Promise<boolean>;
  getOwnedJob(userId: string, jobId: string): Promise<ProcessingJob | null>;
  succeedJob(input: SucceedJobInput): Promise<ProcessingJob>;
  failJob(input: FailJobInput): Promise<ProcessingJob>;
};

type AssetRepository = {
  setStatus(
    userId: string,
    assetId: string,
    status: "extracting",
    errorCode: null,
  ): Promise<unknown>;
};

export type ResumeExtractionServiceDependencies = {
  jobs: JobRepository;
  assets: AssetRepository;
  storage: { download(storagePath: string): Promise<Blob> };
  parser(buffer: Buffer, contentType: string): Promise<string>;
  provider: Pick<AIProvider, "extractResumeFacts">;
  priceSchedule?: AIPriceSchedule;
  clock?: () => Date;
};

const safeErrorCodes = new Set([
  "resume-text-too-short",
  "resume-text-too-long",
  "unsupported-content-type",
  "source-download-failed",
  "ai-provider-authentication-failed",
  "ai-provider-rate-limited",
  "ai-provider-request-failed",
  "ai-provider-timeout",
  "resume-extraction-invalid-output",
]);

function safeFailure(error: unknown) {
  const candidate = error instanceof Error ? error.message : "";
  return {
    errorCode: safeErrorCodes.has(candidate)
      ? candidate
      : "resume-extraction-failed",
    errorMessage: "简历处理失败，请稍后重试。",
  };
}

export function createResumeExtractionService(
  dependencies: ResumeExtractionServiceDependencies,
) {
  const clock = dependencies.clock ?? (() => new Date());

  return {
    async run(input: {
      userId: string;
      job: ProcessingJob;
      asset: ResumeExtractionAsset;
      sourceText?: string;
    }): Promise<ProcessingJob> {
      const claimed = await dependencies.jobs.claimJob(input.job.id);
      if (!claimed) {
        const current = await dependencies.jobs.getOwnedJob(
          input.userId,
          input.job.id,
        );
        if (!current) throw new Error("processing-job-not-found");
        return current;
      }

      try {
        await dependencies.assets.setStatus(
          input.userId,
          input.asset.id,
          "extracting",
          null,
        );
        let resumeText = input.sourceText;
        if (resumeText === undefined) {
          const source = await dependencies.storage.download(
            input.asset.storagePath,
          );
          resumeText = await dependencies.parser(
            Buffer.from(await source.arrayBuffer()),
            input.asset.contentType,
          );
        }
        const aiResult = await dependencies.provider.extractResumeFacts(
          resumeText,
        );
        const acceptedFacts: ExtractedFact[] = [];
        let rejectedCount = 0;

        for (const candidate of aiResult.data.facts) {
          if (verifyCandidateEvidence(resumeText, candidate.sourceExcerpt)) {
            acceptedFacts.push(candidate);
          } else {
            rejectedCount += 1;
          }
        }

        const scheduleMatches =
          dependencies.priceSchedule?.provider === aiResult.provider &&
          dependencies.priceSchedule.model === aiResult.model;
        const estimatedCost = scheduleMatches
          ? estimateAITextCost(
              aiResult.usage,
              dependencies.priceSchedule!,
              clock(),
            )
          : null;
        const aiUsage: ResumeExtractionJobResult["ai"] = {
          provider: aiResult.provider,
          model: aiResult.model,
          requestId: aiResult.requestId,
          usage: aiResult.usage,
          priceScheduleVersion: scheduleMatches
            ? dependencies.priceSchedule!.version
            : null,
        };

        return await dependencies.jobs.succeedJob({
          jobId: input.job.id,
          assetId: input.asset.id,
          acceptedFacts,
          acceptedCount: acceptedFacts.length,
          rejectedCount,
          aiUsage,
          estimatedCost,
        });
      } catch (error) {
        return dependencies.jobs.failJob({
          jobId: input.job.id,
          assetId: input.asset.id,
          ...safeFailure(error),
        });
      }
    },
  };
}
