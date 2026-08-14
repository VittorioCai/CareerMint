import { z } from "zod";

import type { AIUsage } from "@/features/extraction/provider";
import {
  careerFactDataSchema,
  factTypeSchema,
  type CareerFact,
} from "@/features/career-profile/schemas";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import {
  requirementCategorySchema,
  requirementPrioritySchema,
} from "@/features/jd-analysis/schemas";

export const resumeSectionSchema = z.enum([
  "summary",
  "experience",
  "project",
  "education",
  "skills",
  "certification",
  "language",
  "achievement",
]);

export const resumeSuggestionDecisionSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
]);

export const resumeSuggestionSchema = z.object({
  section: resumeSectionSchema,
  content: z.string().trim().min(1).max(700),
  reason: z.string().trim().min(1).max(500),
  factIds: z.array(z.uuid()).min(1).max(5),
  requirementIds: z.array(z.uuid()).max(5),
});

export const resumeSuggestionOutputSchema = z.object({
  suggestions: z.array(resumeSuggestionSchema).max(40),
});

export const resumeRequirementContextSchema = z.object({
  id: z.uuid(),
  category: requirementCategorySchema,
  text: z.string().trim().min(1).max(500),
  priority: requirementPrioritySchema,
});

export type ResumeSection = z.infer<typeof resumeSectionSchema>;
export type ResumeSuggestionDecision = z.infer<
  typeof resumeSuggestionDecisionSchema
>;
export type ResumeSuggestion = z.infer<typeof resumeSuggestionSchema>;
export type ResumeSuggestionOutput = z.infer<
  typeof resumeSuggestionOutputSchema
>;
export type ResumeRequirementContext = z.infer<
  typeof resumeRequirementContextSchema
>;

export type ResumeGenerationInput = {
  jdText: string;
  confirmedFacts: ConfirmedFactForAnalysis[];
  requirements: ResumeRequirementContext[];
};

export type SanitizedResumeSuggestions = ResumeSuggestionOutput & {
  rejectedSuggestionCount: number;
  rejectedReferenceCount: number;
};

export type ResumeGenerationRunResult = {
  acceptedSuggestionCount: number;
  rejectedSuggestionCount: number;
  rejectedReferenceCount: number;
  ai: {
    provider: string;
    model: string;
    requestId: string | null;
    usage: AIUsage;
    priceScheduleVersion: string | null;
  };
  estimatedCost: {
    amount: number;
    currency: "USD";
    scheduleVersion: string;
    tier: "default" | "peak";
  } | null;
};

export type ResumeGenerationRun = {
  id: string;
  applicationId: string;
  userId: string;
  inputHash: string;
  provider: string;
  model: string;
  status: "queued" | "running" | "succeeded" | "failed";
  attemptCount: number;
  result: ResumeGenerationRunResult | null;
  errorCode: string | null;
  createdAt: string;
};

export type ResumeSuggestionRecord = Omit<
  ResumeSuggestion,
  "factIds" | "requirementIds"
> & {
  id: string;
  runId: string;
  applicationId: string;
  decision: ResumeSuggestionDecision;
  reviewedContent: string | null;
  sortOrder: number;
  facts: ConfirmedFactForAnalysis[];
  requirements: ResumeRequirementContext[];
};

export const resumeFactSnapshotSchema = z.object({
  id: z.uuid(),
  factType: factTypeSchema,
  data: careerFactDataSchema,
  sourceExcerpt: z.string().nullable(),
  confirmedAt: z.string().min(1),
});

export type ResumeFactSnapshot = z.infer<typeof resumeFactSnapshotSchema> & {
  factType: CareerFact["factType"];
  data: CareerFact["data"];
};

export type ResumeVersionItemEvidence = {
  careerFactId: string | null;
  factSnapshot: ResumeFactSnapshot;
};

export type ResumeVersionItem = {
  id: string;
  section: ResumeSection;
  content: string;
  reason: string;
  sortOrder: number;
  evidence: ResumeVersionItemEvidence[];
};

export type ResumeVersion = {
  id: string;
  applicationId: string;
  userId: string;
  sourceRunId: string;
  versionNumber: number;
  template: "simple" | "modern";
  createdAt: string;
  items: ResumeVersionItem[];
};

function deduplicationKey(suggestion: ResumeSuggestion) {
  return `${suggestion.section}:${suggestion.content
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()}`;
}

function normalizeProtectedClaim(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function resumeContentUsesOnlySupportedProtectedClaims(
  content: string,
  facts: ConfirmedFactForAnalysis[],
) {
  const evidenceText = normalizeProtectedClaim(
    facts
      .flatMap((fact) => [
        fact.title,
        fact.organization ?? "",
        fact.description,
        ...fact.skills,
        fact.sourceExcerpt ?? "",
      ])
      .join(" "),
  );
  const protectedClaims = content.match(
    /(?:[$€£¥]\s*)?\d+(?:[.,]\d+)*(?:\s*%|\s*(?:k|m|bn|million|billion|thousand))?/gi,
  );
  return (protectedClaims ?? []).every((claim) =>
    evidenceText.includes(normalizeProtectedClaim(claim)),
  );
}

export function sanitizeResumeSuggestions({
  confirmedFacts,
  requirements,
  output,
}: Omit<ResumeGenerationInput, "jdText"> & {
  output: ResumeSuggestionOutput;
}): SanitizedResumeSuggestions {
  const parsed = resumeSuggestionOutputSchema.parse(output);
  const confirmedFactIds = new Set(confirmedFacts.map((fact) => fact.id));
  const requirementIds = new Set(requirements.map((requirement) => requirement.id));
  const seen = new Set<string>();
  const suggestions: ResumeSuggestion[] = [];
  let rejectedSuggestionCount = 0;
  let rejectedReferenceCount = 0;

  for (const candidate of parsed.suggestions) {
    const key = deduplicationKey(candidate);
    const factIds = [...new Set(candidate.factIds)];
    const unknownFactCount = factIds.filter(
      (factId) => !confirmedFactIds.has(factId),
    ).length;
    const validRequirementIds = [
      ...new Set(
        candidate.requirementIds.filter((requirementId) =>
          requirementIds.has(requirementId),
        ),
      ),
    ];
    const unknownRequirementCount =
      new Set(candidate.requirementIds).size - validRequirementIds.length;
    rejectedReferenceCount += unknownFactCount + unknownRequirementCount;

    const referencedFacts = factIds
      .map((factId) =>
        confirmedFacts.find((confirmedFact) => confirmedFact.id === factId),
      )
      .filter((fact) => fact !== undefined);
    if (
      seen.has(key) ||
      unknownFactCount > 0 ||
      factIds.length === 0 ||
      !resumeContentUsesOnlySupportedProtectedClaims(
        candidate.content,
        referencedFacts,
      )
    ) {
      rejectedSuggestionCount += 1;
      continue;
    }
    seen.add(key);
    suggestions.push({
      ...candidate,
      factIds,
      requirementIds: validRequirementIds,
    });
  }

  return {
    suggestions,
    rejectedSuggestionCount,
    rejectedReferenceCount,
  };
}
