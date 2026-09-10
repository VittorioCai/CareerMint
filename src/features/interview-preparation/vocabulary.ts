/**
 * The interview vocabularies, with nothing else in the module.
 *
 * Split out of `schemas.ts` for the reason described in
 * `@/features/applications/stages`: a client component maps over these to
 * build a `<select>`, and importing them from a module that imports zod
 * shipped 287 KB of validator to the browser — measured on `/interview`,
 * which transferred 929 KB against its siblings' 620.
 *
 * `schemas.ts` still derives its enums from here, so nothing can drift.
 */
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

export type InterviewQuestionCategory =
  (typeof INTERVIEW_QUESTION_CATEGORIES)[number];
export type InterviewPreparationStatus =
  (typeof INTERVIEW_PREPARATION_STATUSES)[number];
export type InterviewQuestionSource =
  (typeof INTERVIEW_QUESTION_SOURCES)[number];
