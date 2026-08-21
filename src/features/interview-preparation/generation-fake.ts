import type { AIProvider } from "@/features/extraction/provider";

export function selectInterviewQuestionProviderConfiguration(input: {
  fakeExtractor: boolean;
  production: boolean;
  provider: string;
  model: string;
}) {
  if (input.fakeExtractor && !input.production) {
    return { provider: "fake", model: "fake-interview-question-generator-v1" };
  }
  return { provider: input.provider, model: input.model };
}

export function takeInterviewQuestionExcerpt(value: string, maxCodePoints = 240) {
  return Array.from(value.trim()).slice(0, maxCodePoints).join("");
}

export function createFakeInterviewQuestionProvider(): Pick<
  AIProvider,
  "generateInterviewQuestions"
> {
  return {
    async generateInterviewQuestions(input) {
      const sourceExcerpt = takeInterviewQuestionExcerpt(input.jdText);
      const requirement = input.requirements[0];
      return {
        data: {
          questions: sourceExcerpt
            ? [
                {
                  category:
                    requirement?.category === "industry"
                      ? "industry"
                      : "job_specific",
                  prompt: "How would you prepare for this role's priorities?",
                  sourceExcerpt,
                  relevanceReason:
                    "This preparation question is grounded in the supplied job description.",
                },
              ]
            : [],
        },
        provider: "fake",
        model: "fake-interview-question-generator-v1",
        requestId: null,
        usage: {
          inputCacheHitTokens: 0,
          inputCacheMissTokens: 0,
          outputTokens: 0,
        },
      };
    },
  };
}
