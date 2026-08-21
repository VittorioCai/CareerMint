import { z } from "zod";

import {
  normalizeEvidence,
  unicodeCodePointLength,
} from "@/features/extraction/evidence";
import { normalizeQuestionPrompt } from "./schemas";

export const interviewQuestionGenerationCategorySchema = z.enum([
  "function",
  "industry",
  "job_specific",
]);

function unicodeBoundedText(min: number, max: number) {
  return z.string().trim().refine(
    (value) => {
      const length = unicodeCodePointLength(value);
      return length >= min && length <= max;
    },
    { message: `Must contain between ${min} and ${max} Unicode characters.` },
  );
}

export const interviewQuestionGenerationCandidateSchema = z
  .object({
    category: interviewQuestionGenerationCategorySchema,
    prompt: unicodeBoundedText(8, 500),
    sourceExcerpt: unicodeBoundedText(1, 240),
    relevanceReason: unicodeBoundedText(1, 700),
  })
  .strict();

export const interviewQuestionCandidateSchema =
  interviewQuestionGenerationCandidateSchema;

export const interviewQuestionGenerationOutputSchema = z
  .object({
    questions: z.array(interviewQuestionGenerationCandidateSchema).max(24),
  })
  .strict();

export const interviewQuestionGenerationSchema =
  interviewQuestionGenerationOutputSchema;

export type InterviewQuestionGenerationCategory = z.infer<
  typeof interviewQuestionGenerationCategorySchema
>;
export type InterviewQuestionGenerationCandidate = z.infer<
  typeof interviewQuestionGenerationCandidateSchema
>;
export type InterviewQuestionGenerationOutput = z.infer<
  typeof interviewQuestionGenerationOutputSchema
>;

export type InterviewQuestionGenerationRequirement = {
  id: string;
  category: string;
  text: string;
  sourceExcerpt: string | null;
  priority: string;
};

export type InterviewQuestionGenerationInput = {
  jdText: string;
  requirements: InterviewQuestionGenerationRequirement[];
  commonPrompts: string[];
};

export type SanitizedInterviewQuestionGeneration = {
  questions: InterviewQuestionGenerationCandidate[];
  rejectedQuestionCount: number;
};

const maxAcceptedQuestions = 6;

function excerptIsGrounded(normalizedJd: string, sourceExcerpt: string) {
  const normalizedExcerpt = normalizeEvidence(sourceExcerpt);
  return normalizedExcerpt.length > 0 && normalizedJd.includes(normalizedExcerpt);
}

export function sanitizeInterviewQuestionGeneration(
  input: InterviewQuestionGenerationInput & {
    output: InterviewQuestionGenerationOutput;
  },
): SanitizedInterviewQuestionGeneration {
  const { jdText, commonPrompts, output } = input;
  const normalizedJd = normalizeEvidence(jdText);
  const parsed = interviewQuestionGenerationOutputSchema.parse(output);
  const commonCanonicalKeys = new Set(
    commonPrompts
      .map((prompt) => normalizeQuestionPrompt(prompt))
      .filter((prompt) => prompt.length > 0),
  );
  const seenCanonicalKeys = new Set<string>();
  const questions: InterviewQuestionGenerationCandidate[] = [];
  let rejectedQuestionCount = 0;

  for (const candidate of parsed.questions) {
    const canonicalKey = normalizeQuestionPrompt(candidate.prompt);
    if (
      canonicalKey.length === 0 ||
      commonCanonicalKeys.has(canonicalKey) ||
      seenCanonicalKeys.has(canonicalKey) ||
      !excerptIsGrounded(normalizedJd, candidate.sourceExcerpt)
    ) {
      rejectedQuestionCount += 1;
      continue;
    }

    seenCanonicalKeys.add(canonicalKey);
    if (questions.length >= maxAcceptedQuestions) {
      rejectedQuestionCount += 1;
      continue;
    }
    questions.push(candidate);
  }

  if (questions.length === 0) {
    throw new Error("interview-question-generation-invalid-output");
  }

  return { questions, rejectedQuestionCount };
}

export const sanitizeInterviewQuestionCandidates =
  sanitizeInterviewQuestionGeneration;
