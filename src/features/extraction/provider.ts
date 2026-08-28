import type { ResumeExtraction } from "./schemas";
import type {
  JDAnalysis,
  JobDescriptionAnalysisInput,
} from "@/features/jd-analysis/schemas";
import type {
  ResumeGenerationInput,
  ResumeSuggestionOutput,
} from "@/features/resume-customization/schemas";
import type {
  InterviewQuestionGenerationInput,
  InterviewQuestionGenerationOutput,
} from "@/features/interview-preparation/generation-schemas";
import type {
  ResumeGapAnalysisInput,
  ResumeGapProviderOutput,
} from "@/features/resume-gaps/schemas";
import type { ComparisonPromptVariant } from "@/features/jd-gap-analysis/prompts";
import type {
  JDGapComparisonInput,
  JDGapComparisonOutput,
  JDStructureInput,
  JDStructureProviderOutput,
} from "@/features/jd-gap-analysis/schemas";
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
  analyzeJobDescription(
    input: JobDescriptionAnalysisInput,
  ): Promise<AIResult<JDAnalysis>>;
  generateResumeSuggestions(
    input: ResumeGenerationInput,
  ): Promise<AIResult<ResumeSuggestionOutput>>;
  generateInterviewQuestions(
    input: InterviewQuestionGenerationInput,
  ): Promise<AIResult<InterviewQuestionGenerationOutput>>;
  analyzeResumeGaps(
    input: ResumeGapAnalysisInput,
  ): Promise<AIResult<ResumeGapProviderOutput>>;
  structureJobDescription(
    input: JDStructureInput,
  ): Promise<AIResult<JDStructureProviderOutput>>;
  compareJDGapCriteria(
    input: JDGapComparisonInput,
    options: { promptVariant: ComparisonPromptVariant },
  ): Promise<AIResult<JDGapComparisonOutput>>;
  analyzeResumeJDDifference(
    input: ResumeJDDifferenceInput,
    options: { promptVariant: DifferencePromptVariant },
  ): Promise<AIResult<ResumeJDDifferenceOutput>>;
};
