import type { AIProvider } from "./provider";
import type {
  ResumeExtractionAsset,
} from "./service";
import type {
  ProcessingJob,
} from "@/features/jobs/repository";
import { sourceAssetIdSchema } from "@/features/source-assets/schemas";

export type SourceAssetExtractPostDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getOwnedAsset(
    userId: string,
    assetId: string,
  ): Promise<ResumeExtractionAsset | null>;
  getAIProcessingConsentAt(userId: string): Promise<string | null>;
  createOrGetJob(
    assetId: string,
    idempotencyKey: string,
  ): Promise<ProcessingJob>;
  providerFactory(): Pick<AIProvider, "extractResumeFacts">;
  runExtraction(input: {
    userId: string;
    job: ProcessingJob;
    asset: ResumeExtractionAsset;
    provider: Pick<AIProvider, "extractResumeFacts">;
  }): Promise<ProcessingJob>;
};

export function createSourceAssetExtractPostHandler(
  dependencies: SourceAssetExtractPostDependencies,
) {
  return async function post(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const user = await dependencies.getCurrentUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const parsedId = sourceAssetIdSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json(
        { error: "source-asset-not-found" },
        { status: 404 },
      );
    }

    try {
      const asset = await dependencies.getOwnedAsset(user.id, parsedId.data);
      if (!asset) {
        return Response.json(
          { error: "source-asset-not-found" },
          { status: 404 },
        );
      }

      const consentAt = await dependencies.getAIProcessingConsentAt(user.id);
      if (!consentAt) {
        return Response.json(
          { error: "ai-processing-consent-required" },
          { status: 403 },
        );
      }

      const idempotencyKey = `source-asset:${asset.id}:resume-extract:v1`;
      const job = await dependencies.createOrGetJob(
        asset.id,
        idempotencyKey,
      );
      if (job.status === "running" || job.status === "succeeded") {
        return Response.json({ jobId: job.id, status: job.status });
      }

      const completed = await dependencies.runExtraction({
        userId: user.id,
        job,
        asset,
        provider: dependencies.providerFactory(),
      });
      return Response.json({ jobId: completed.id, status: completed.status });
    } catch {
      return Response.json(
        { error: "resume-extraction-request-failed" },
        { status: 500 },
      );
    }
  };
}
