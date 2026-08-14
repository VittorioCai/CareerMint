import { createHash } from "node:crypto";

import { z } from "zod";

import type { Application } from "@/features/applications/schemas";
import type { AIProvider } from "@/features/extraction/provider";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import type {
  ResumeGenerationRun,
  ResumeRequirementContext,
} from "./schemas";

const applicationIdSchema = z.uuid();
const resumeGenerationSchemaVersion = "resume-generation-v1";

export type ResumeGenerationPostDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getApplication(
    userId: string,
    applicationId: string,
  ): Promise<Pick<Application, "id" | "userId" | "jdText"> | null>;
  getAIProcessingConsentAt(userId: string): Promise<string | null>;
  listConfirmedFacts(userId: string): Promise<ConfirmedFactForAnalysis[]>;
  listRequirements(
    userId: string,
    applicationId: string,
  ): Promise<ResumeRequirementContext[]>;
  createOrGetRun(input: {
    applicationId: string;
    inputHash: string;
    provider: string;
    model: string;
  }): Promise<ResumeGenerationRun>;
  providerConfig: { provider: string; model: string };
  providerFactory(): Pick<AIProvider, "generateResumeSuggestions">;
  runGeneration(input: {
    userId: string;
    run: ResumeGenerationRun;
    application: Pick<Application, "id" | "userId" | "jdText">;
    confirmedFacts: ConfirmedFactForAnalysis[];
    requirements: ResumeRequirementContext[];
    provider: Pick<AIProvider, "generateResumeSuggestions">;
  }): Promise<ResumeGenerationRun>;
};

export function buildResumeGenerationInputHash(input: {
  jdText: string;
  confirmedFacts: ConfirmedFactForAnalysis[];
  requirements: ResumeRequirementContext[];
  provider: string;
  model: string;
}) {
  const confirmedFacts = [...input.confirmedFacts]
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
  const requirements = [...input.requirements]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((requirement) => ({
      id: requirement.id,
      category: requirement.category,
      text: requirement.text,
      priority: requirement.priority,
    }));
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: resumeGenerationSchemaVersion,
        provider: input.provider,
        model: input.model,
        jdText: input.jdText,
        confirmedFacts,
        requirements,
      }),
    )
    .digest("hex");
}

export function createResumeGenerationPostHandler(
  dependencies: ResumeGenerationPostDependencies,
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
      const application = await dependencies.getApplication(user.id, parsedId.data);
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

      const [confirmedFacts, requirements] = await Promise.all([
        dependencies.listConfirmedFacts(user.id),
        dependencies.listRequirements(user.id, application.id),
      ]);
      if (confirmedFacts.length === 0) {
        return Response.json(
          { error: "confirmed-facts-required" },
          { status: 409 },
        );
      }
      if (requirements.length === 0) {
        return Response.json(
          { error: "jd-analysis-required" },
          { status: 409 },
        );
      }

      const inputHash = buildResumeGenerationInputHash({
        jdText: application.jdText,
        confirmedFacts,
        requirements,
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
      const completed = await dependencies.runGeneration({
        userId: user.id,
        run,
        application,
        confirmedFacts,
        requirements,
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
        { error: "resume-generation-request-failed" },
        { status: 500 },
      );
    }
  };
}
