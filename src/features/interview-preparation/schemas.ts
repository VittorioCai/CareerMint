import { z } from "zod";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import { normalizeForMatching } from "@/features/extraction/evidence";

export const INTERVIEW_QUESTION_CATEGORIES = [
  "common",
  "function",
  "industry",
  "job_specific",
] as const;
export const INTERVIEW_PREPARATION_STATUSES = [
  "not_started",
  "outlined",
  "practiced",
  "ready",
] as const;
export const INTERVIEW_QUESTION_SOURCES = ["builtin", "manual", "ai"] as const;

export const interviewQuestionCategorySchema = z.enum(
  INTERVIEW_QUESTION_CATEGORIES,
);
export const interviewPreparationStatusSchema = z.enum(
  INTERVIEW_PREPARATION_STATUSES,
);
export const interviewQuestionSourceSchema = z.enum(
  INTERVIEW_QUESTION_SOURCES,
);

export type InterviewQuestionCategory = z.infer<
  typeof interviewQuestionCategorySchema
>;
export type InterviewPreparationStatus = z.infer<
  typeof interviewPreparationStatusSchema
>;
export type InterviewQuestionSource = z.infer<
  typeof interviewQuestionSourceSchema
>;

export const INTERVIEW_CATEGORY_LABELS: Record<
  InterviewQuestionCategory,
  string
> = {
  common: "通用",
  function: "职能",
  industry: "行业",
  job_specific: "岗位特定",
};

export const INTERVIEW_STATUS_LABELS: Record<
  InterviewPreparationStatus,
  string
> = {
  not_started: "未开始",
  outlined: "已列提纲",
  practiced: "已练习",
  ready: "已准备",
};

function optionalUuid(value: unknown) {
  return value == null || (typeof value === "string" && value.trim() === "")
    ? null
    : value;
}

function optionalText(maxLength: number) {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    },
    z.string().max(maxLength).nullable(),
  );
}

export function normalizeQuestionPrompt(prompt: string) {
  return normalizeForMatching(prompt).replace(/[?？!.！。]+$/g, "");
}

export const addInterviewQuestionSchema = z
  .object({
    prompt: z.string().trim().min(8).max(500),
    category: interviewQuestionCategorySchema,
    applicationId: z.preprocess(optionalUuid, z.uuid().nullable()),
  })
  .superRefine((input, context) => {
    if (input.category === "job_specific" && !input.applicationId) {
      context.addIssue({
        code: "custom",
        path: ["applicationId"],
        message: "Job-specific questions require an application.",
      });
    }
  });

export const updateInterviewQuestionSchema = z.object({
  questionId: z.uuid(),
  applicationId: z.preprocess(optionalUuid, z.uuid().nullable()),
  preparationStatus: interviewPreparationStatusSchema,
  answerOutline: optionalText(10_000),
  notes: optionalText(10_000),
  factIds: z.array(z.uuid()).max(8).transform((ids) => [...new Set(ids)]),
});

export const addInterviewQuestionVariantSchema = z.object({
  questionId: z.uuid(),
  applicationId: z.preprocess(optionalUuid, z.uuid().nullable()),
  wording: z.string().trim().min(8).max(500),
});

export const interviewQuestionFilterSchema = z.object({
  q: z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().max(200),
    )
    .catch("")
    .default(""),
  category: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    interviewQuestionCategorySchema.optional(),
  ),
  status: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    interviewPreparationStatusSchema.optional(),
  ),
});

const candidateIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(6)
  .transform((ids) => [...new Set(ids)]);

export const acceptInterviewQuestionCandidatesSchema = z.object({
  applicationId: z.uuid(),
  candidateIds: candidateIdsSchema,
});

export const rejectInterviewQuestionCandidatesSchema = z.object({
  applicationId: z.uuid(),
  runId: z.uuid(),
  candidateIds: candidateIdsSchema,
});

export type InterviewQuestion = {
  id: string;
  userId: string;
  category: InterviewQuestionCategory;
  canonicalKey: string;
  prompt: string;
  source: InterviewQuestionSource;
  preparationStatus: InterviewPreparationStatus;
  answerOutline: string | null;
  notes: string | null;
  variants: Array<{ id: string; wording: string }>;
  applicationLinks: Array<{
    applicationId: string;
    predicted: boolean;
    relevanceReason: string | null;
    sourceExcerpt: string | null;
  }>;
  facts: ConfirmedFactForAnalysis[];
  createdAt: string;
  updatedAt: string;
};
