import { createHash } from "node:crypto";

import { z } from "zod";

import type { AIProvider } from "@/features/extraction/provider";
import type { Application } from "@/features/applications/schemas";
import type { InterviewQuestionGenerationRequirement } from "./generation-schemas";
import { normalizeQuestionPrompt } from "./schemas";
import type { InterviewQuestionGenerationRun } from "./generation-service";

const applicationIdSchema = z.uuid();
export const interviewQuestionGenerationSchemaVersion =
  "interview-question-generation-v1";
export const interviewQuestionGenerationLeaseMs = 2 * 60 * 1000;

export type InterviewQuestionGenerationPostDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getApplication(
    userId: string,
    applicationId: string,
  ): Promise<Pick<Application, "id" | "userId" | "jdText"> | null>;
  getAIProcessingConsentAt(userId: string): Promise<string | null>;
  listRequirements(
    userId: string,
    applicationId: string,
  ): Promise<InterviewQuestionGenerationRequirement[]>;
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
  clock?: () => Date;
  runGeneration(input: {
    userId: string;
    run: InterviewQuestionGenerationRun;
    application: Pick<Application, "id" | "userId" | "jdText">;
    requirements: InterviewQuestionGenerationRequirement[];
    commonPrompts: string[];
    providerFactory: () => Pick<AIProvider, "generateInterviewQuestions">;
  }): Promise<InterviewQuestionGenerationRun>;
};

export function isFreshInterviewQuestionGenerationRun(
  run: InterviewQuestionGenerationRun,
  now: Date,
) {
  if (run.status !== "running") return false;
  const updatedAt = Date.parse(run.updatedAt);
  const nowMs = now.getTime();
  return (
    Number.isFinite(updatedAt) &&
    Number.isFinite(nowMs) &&
    updatedAt > nowMs - interviewQuestionGenerationLeaseMs
  );
}

export function buildInterviewQuestionGenerationInputHash(input: {
  jdText: string;
  requirements: InterviewQuestionGenerationRequirement[];
  commonPrompts: string[];
  provider: string;
  model: string;
  schemaVersion?: string;
}) {
  const requirements = [...input.requirements]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((requirement) => ({
      id: requirement.id,
      category: requirement.category,
      text: requirement.text,
      sourceExcerpt: requirement.sourceExcerpt,
      priority: requirement.priority,
    }));
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
        requirements,
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

      const [requirements, commonPrompts] = await Promise.all([
        dependencies.listRequirements(user.id, application.id),
        dependencies.listCommonPrompts(user.id),
      ]);
      const inputHash = buildInterviewQuestionGenerationInputHash({
        jdText: application.jdText,
        requirements,
        commonPrompts,
        ...dependencies.providerConfig,
      });
      const run = await dependencies.createOrGetRun({
        applicationId: application.id,
        inputHash,
        schemaVersion: interviewQuestionGenerationSchemaVersion,
        ...dependencies.providerConfig,
      });
      if (
        run.status === "succeeded" ||
        isFreshInterviewQuestionGenerationRun(
          run,
          dependencies.clock?.() ?? new Date(),
        )
      ) {
        return Response.json({
          runId: run.id,
          status: run.status,
          reused: true,
          errorCode: run.errorCode,
        });
      }

      const completed = await dependencies.runGeneration({
        userId: user.id,
        run,
        application,
        requirements,
        commonPrompts,
        providerFactory: dependencies.providerFactory,
      });
      return Response.json({
        runId: completed.id,
        status: completed.status,
        reused: false,
        errorCode: completed.errorCode,
      });
    } catch {
      return Response.json(
        { error: "interview-question-generation-request-failed" },
        { status: 500 },
      );
    }
  };
}
