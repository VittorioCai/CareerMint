import { z } from "zod";

import { factTypeSchema } from "@/features/career-profile/schemas";
import { verifyCandidateEvidence } from "@/features/extraction/evidence";

export const requirementCategorySchema = z.enum([
  "responsibility",
  "hard_requirement",
  "preferred",
  "skill",
  "language_work_authorization",
  "location_workplace",
  "compensation",
]);

export const requirementPrioritySchema = z.enum(["core", "supporting"]);

export const requirementMatchStatusSchema = z.enum([
  "evidence",
  "partial",
  "none",
  "needs_user",
]);

export const confirmedFactForAnalysisSchema = z.object({
  id: z.uuid(),
  factType: factTypeSchema,
  title: z.string().trim().min(1).max(160),
  organization: z.string().trim().min(1).max(160).nullable(),
  description: z.string().trim().min(1).max(4000),
  skills: z.array(z.string().trim().min(1).max(80)).max(30),
  sourceExcerpt: z.string().trim().min(1).max(1000).nullable(),
});

export const jdRequirementSchema = z.object({
  category: requirementCategorySchema,
  text: z.string().trim().min(1).max(500),
  sourceExcerpt: z.string().trim().min(12).max(1000),
  priority: requirementPrioritySchema,
  matchStatus: requirementMatchStatusSchema,
  matchReason: z.string().trim().min(1).max(700).nullable(),
  matchedFactIds: z.array(z.uuid()).max(5),
});

export const jdAnalysisSchema = z.object({
  requirements: z.array(jdRequirementSchema).max(80),
});

export type ConfirmedFactForAnalysis = z.infer<
  typeof confirmedFactForAnalysisSchema
>;
export type JDRequirement = z.infer<typeof jdRequirementSchema>;
export type JDAnalysis = z.infer<typeof jdAnalysisSchema>;
export type RequirementCategory = z.infer<typeof requirementCategorySchema>;
export type RequirementMatchStatus = z.infer<
  typeof requirementMatchStatusSchema
>;

export type JobDescriptionAnalysisInput = {
  jdText: string;
  confirmedFacts: ConfirmedFactForAnalysis[];
};

export type SanitizedJDAnalysis = JDAnalysis & {
  rejectedRequirementCount: number;
  rejectedEvidenceCount: number;
};

function deduplicationKey(requirement: JDRequirement) {
  return `${requirement.category}:${requirement.text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()}`;
}

export function sanitizeJDAnalysis({
  jdText,
  confirmedFacts,
  analysis,
}: JobDescriptionAnalysisInput & { analysis: JDAnalysis }): SanitizedJDAnalysis {
  const parsed = jdAnalysisSchema.parse(analysis);
  const confirmedIds = new Set(confirmedFacts.map((fact) => fact.id));
  const seen = new Set<string>();
  const requirements: JDRequirement[] = [];
  let rejectedRequirementCount = 0;
  let rejectedEvidenceCount = 0;

  for (const candidate of parsed.requirements) {
    const key = deduplicationKey(candidate);
    if (
      seen.has(key) ||
      !verifyCandidateEvidence(jdText, candidate.sourceExcerpt)
    ) {
      rejectedRequirementCount += 1;
      continue;
    }
    seen.add(key);

    const matchedFactIds = [
      ...new Set(
        candidate.matchedFactIds.filter((factId) => {
          const accepted = confirmedIds.has(factId);
          if (!accepted) rejectedEvidenceCount += 1;
          return accepted;
        }),
      ),
    ];

    if (
      candidate.matchStatus === "none" ||
      candidate.matchStatus === "needs_user"
    ) {
      rejectedEvidenceCount += matchedFactIds.length;
      matchedFactIds.length = 0;
    }

    const hasEvidence = matchedFactIds.length > 0;
    requirements.push({
      ...candidate,
      matchStatus:
        (candidate.matchStatus === "evidence" ||
          candidate.matchStatus === "partial") &&
        !hasEvidence
          ? "none"
          : candidate.matchStatus,
      matchReason:
        (candidate.matchStatus === "evidence" ||
          candidate.matchStatus === "partial") &&
        !hasEvidence
          ? null
          : candidate.matchReason,
      matchedFactIds,
    });
  }

  return {
    requirements,
    rejectedRequirementCount,
    rejectedEvidenceCount,
  };
}
