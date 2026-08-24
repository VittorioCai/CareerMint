import { createHash } from "node:crypto";

import { z } from "zod";

import type { AIProvider } from "@/features/extraction/provider";
import type { Application } from "@/features/applications/schemas";

import type {
  ConfirmedFactForAnalysis,
  JDAnalysisRun,
} from "./schemas";

const applicationIdSchema = z.uuid();
export const applicationAnalysisSchemaVersion = "jd-analysis-v2";

export type ApplicationAnalysisPostDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getApplication(
    userId: string,
    applicationId: string,
  ): Promise<Pick<Application, "id" | "userId" | "jdText"> | null>;
  getAIProcessingConsentAt(userId: string): Promise<string | null>;
  listConfirmedFacts(userId: string): Promise<ConfirmedFactForAnalysis[]>;
  createOrGetRun(input: {
    applicationId: string;
    inputHash: string;
    provider: string;
    model: string;
  }): Promise<JDAnalysisRun>;
  providerConfig: { provider: string; model: string };
  providerFactory(): Pick<AIProvider, "analyzeJobDescription">;
  runAnalysis(input: {
    userId: string;
    run: JDAnalysisRun;
    application: Pick<Application, "id" | "userId" | "jdText">;
    confirmedFacts: ConfirmedFactForAnalysis[];
    provider: Pick<AIProvider, "analyzeJobDescription">;
  }): Promise<JDAnalysisRun>;
};

export function buildApplicationAnalysisInputHash(input: {
  jdText: string;
  confirmedFacts: ConfirmedFactForAnalysis[];
  provider: string;
  model: string;
}) {
  const facts = [...input.confirmedFacts]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((fact) => ({
      id: fact.id,
      factType: fact.factType,
      title: fact.title,
      organization: fact.organization,
      description: fact.description,
      skills: fact.skills,
      sourceExcerpt: fact.sourceExcerpt,
    }));
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: applicationAnalysisSchemaVersion,
        provider: input.provider,
        model: input.model,
        jdText: input.jdText,
        confirmedFacts: facts,
      }),
    )
    .digest("hex");
}

export function createApplicationAnalysisPostHandler(
  dependencies: ApplicationAnalysisPostDependencies,
) {
  return async function post(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const user = await dependencies.getCurrentUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const parsedId = applicationIdSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json({ error: "application-not-found" }, { status: 404 });
    }

    try {
      const application = await dependencies.getApplication(
        user.id,
        parsedId.data,
      );
      if (!application) {
        return Response.json(
          { error: "application-not-found" },
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

      const confirmedFacts = await dependencies.listConfirmedFacts(user.id);
      const inputHash = buildApplicationAnalysisInputHash({
        jdText: application.jdText,
        confirmedFacts,
        ...dependencies.providerConfig,
      });
      const run = await dependencies.createOrGetRun({
        applicationId: application.id,
        inputHash,
        ...dependencies.providerConfig,
      });
      if (run.status === "running" || run.status === "succeeded") {
        return Response.json({
          runId: run.id,
          status: run.status,
          reused: true,
          errorCode: run.errorCode,
        });
      }

      const provider = dependencies.providerFactory();
      const completed = await dependencies.runAnalysis({
        userId: user.id,
        run,
        application,
        confirmedFacts,
        provider,
      });
      return Response.json({
        runId: completed.id,
        status: completed.status,
        reused: false,
        errorCode: completed.errorCode,
      });
    } catch {
      return Response.json(
        { error: "jd-analysis-request-failed" },
        { status: 500 },
      );
    }
  };
}
