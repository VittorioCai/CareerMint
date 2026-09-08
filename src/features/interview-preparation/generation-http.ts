import { createHash } from "node:crypto";

import { z } from "zod";

import type { AIProvider } from "@/features/extraction/provider";
import type { Application } from "@/features/applications/schemas";
import { normalizeQuestionPrompt } from "./schemas";
import type {
  InterviewQuestionGenerationRun,
  InterviewQuestionGenerationServiceResult,
} from "./generation-service";

const applicationIdSchema = z.uuid();
export const interviewQuestionGenerationSchemaVersion =
  "interview-question-generation-v1";

export type InterviewQuestionGenerationPostDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getApplication(
    userId: string,
    applicationId: string,
  ): Promise<Pick<Application, "id" | "userId" | "jdText"> | null>;
  getAIProcessingConsentAt(userId: string): Promise<string | null>;
  listCommonPrompts(userId: string): Promise<string[]>;
  createOrGetRun(input: {
    applicationId: string;
    inputHash: string;
    schemaVersion: string;
    provider: string;
    model: string;
  }): Promise<InterviewQuestionGenerationRun>;
  providerConfig: { provider: string; model: string };
  providerFactory(): Pick<AIProvider, "generateInterviewQuestions">;
  runGeneration(input: {
    userId: string;
    run: InterviewQuestionGenerationRun;
    application: Pick<Application, "id" | "userId" | "jdText">;
    commonPrompts: string[];
    providerFactory: () => Pick<AIProvider, "generateInterviewQuestions">;
  }): Promise<InterviewQuestionGenerationServiceResult>;
};

export function buildInterviewQuestionGenerationInputHash(input: {
  jdText: string;
  commonPrompts: string[];
  provider: string;
  model: string;
  schemaVersion?: string;
}) {
  const commonPrompts = input.commonPrompts
    .map((prompt) => normalizeQuestionPrompt(prompt))
    .filter((prompt) => prompt.length > 0)
    .sort((left, right) => left.localeCompare(right));

  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion:
          input.schemaVersion ?? interviewQuestionGenerationSchemaVersion,
        provider: input.provider,
        model: input.model,
        jdText: input.jdText,
        commonPrompts,
      }),
    )
    .digest("hex");
}

export function createInterviewQuestionGenerationPostHandler(
  dependencies: InterviewQuestionGenerationPostDependencies,
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
        return Response.json({ error: "application-not-found" }, { status: 404 });
      }

      const consentAt = await dependencies.getAIProcessingConsentAt(user.id);
      if (!consentAt) {
        return Response.json(
          { error: "ai-processing-consent-required" },
          { status: 403 },
        );
      }

      const commonPrompts = await dependencies.listCommonPrompts(user.id);
      const inputHash = buildInterviewQuestionGenerationInputHash({
        jdText: application.jdText,
        commonPrompts,
        ...dependencies.providerConfig,
      });
      const run = await dependencies.createOrGetRun({
        applicationId: application.id,
        inputHash,
        schemaVersion: interviewQuestionGenerationSchemaVersion,
        ...dependencies.providerConfig,
      });
      if (run.status === "succeeded") {
        return Response.json({
          runId: run.id,
          status: run.status,
          reused: true,
          errorCode: run.errorCode,
        });
      }

      const generation = await dependencies.runGeneration({
        userId: user.id,
        run,
        application,
        commonPrompts,
        providerFactory: dependencies.providerFactory,
      });
      return Response.json({
        runId: generation.run.id,
        status: generation.run.status,
        reused: generation.reused,
        errorCode: generation.run.errorCode,
      });
    } catch {
      return Response.json(
        { error: "interview-question-generation-request-failed" },
        { status: 500 },
      );
    }
  };
}
