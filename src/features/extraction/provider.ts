import type { ResumeExtraction } from "./schemas";
import type {
  InterviewQuestionGenerationInput,
  InterviewQuestionGenerationOutput,
} from "@/features/interview-preparation/generation-schemas";
import type { DifferencePromptVariant } from "@/features/resume-jd-difference/prompts";
import type {
  ResumeJDDifferenceInput,
  ResumeJDDifferenceOutput,
} from "@/features/resume-jd-difference/schemas";

export type AIUsage = {
  inputCacheHitTokens: number;
  inputCacheMissTokens: number;
  outputTokens: number;
};

export type AIResult<T> = {
  data: T;
  provider: string;
  model: string;
  requestId: string | null;
  usage: AIUsage;
};

export type AIProvider = {
  extractResumeFacts(resumeText: string): Promise<AIResult<ResumeExtraction>>;
  generateInterviewQuestions(
    input: InterviewQuestionGenerationInput,
  ): Promise<AIResult<InterviewQuestionGenerationOutput>>;
  analyzeResumeJDDifference(
    input: ResumeJDDifferenceInput,
    options: { promptVariant: DifferencePromptVariant },
  ): Promise<AIResult<ResumeJDDifferenceOutput>>;
};
