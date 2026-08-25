import { z } from "zod";

import { unicodeCodePointLength } from "@/features/extraction/evidence";
import { requirementCategorySchema } from "@/features/jd-analysis/schemas";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

export const criterionKindSchema = z.enum([
  "degree_level",
  "degree_field",
  "years_experience",
  "language",
  "work_authorization",
  "certification",
  "tool",
  "responsibility",
  "industry",
  "soft_skill",
  "quantified_outcome",
  "other",
]);

export const requirementTypeSchema = z.enum(["required", "core", "preferred"]);
export const criterionGroupRuleSchema = z.enum(["all", "any"]);
export const criterionEvidenceStatusSchema = z.enum([
  "direct",
  "partial_direct",
  "none",
  "needs_confirmation",
]);
export const coverageStatusSchema = z.enum([
  "complete",
  "partial",
  "none",
  "needs_confirmation",
]);
export const impactLevelSchema = z.enum(["blocking", "important", "minor"]);
export const gapTypeSchema = z.enum([
  "missing_from_resume",
  "too_vague",
  "missing_result_or_number",
  "no_supporting_fact",
  "language_or_authorization_confirmation",
  "none",
]);

function unicodeBoundedText(min: number, max: number) {
  return z
    .string()
    .trim()
    .refine(
      (value) => {
        const length = unicodeCodePointLength(value);
        return length >= min && length <= max;
      },
      { message: `Must contain between ${min} and ${max} Unicode characters.` },
    );
}

const localRequirementKeySchema = z.string().regex(/^r[1-9][0-9]?$/u);
const localCriterionKeySchema = z.string().regex(/^c[1-9][0-9]{0,2}$/u);
const criterionGroupKeySchema = z.string().regex(/^g[1-9][0-9]?$/u);

export const criterionConstraintSchema = z
  .object({
    operator: z.enum(["none", "exact", "gte", "one_of", "equivalent_allowed"]),
    value: z.string().trim().min(1).max(160).nullable(),
    unit: z.string().trim().min(1).max(40).nullable(),
  })
  .strict();

export const jdStructureCriterionSchema = z
  .object({
    key: localCriterionKeySchema,
    groupKey: criterionGroupKeySchema,
    groupRule: criterionGroupRuleSchema,
    kind: criterionKindSchema,
    originalText: unicodeBoundedText(1, 500),
    translationZh: unicodeBoundedText(1, 1000),
    constraint: criterionConstraintSchema,
  })
  .strict();

export const jdStructureRequirementSchema = z
  .object({
    key: localRequirementKeySchema,
    category: requirementCategorySchema,
    requirementType: requirementTypeSchema,
    originalText: unicodeBoundedText(1, 500),
    translationZh: unicodeBoundedText(1, 1000),
    sourceExcerpt: unicodeBoundedText(12, 1000),
    allowsEquivalent: z.boolean(),
    explicitGate: z.boolean(),
    criteria: z.array(jdStructureCriterionSchema).min(1).max(12),
  })
  .strict()
  .superRefine((requirement, context) => {
    const seenKeys = new Set<string>();
    const groupRules = new Map<string, CriterionGroupRule>();

    requirement.criteria.forEach((criterion, index) => {
      if (seenKeys.has(criterion.key)) {
        context.addIssue({
          code: "custom",
          path: ["criteria", index, "key"],
          message: "Criterion keys must be unique.",
        });
      }
      seenKeys.add(criterion.key);

      const existingRule = groupRules.get(criterion.groupKey);
      if (existingRule && existingRule !== criterion.groupRule) {
        context.addIssue({
          code: "custom",
          path: ["criteria", index, "groupRule"],
          message: "Every criterion in a group must use the same rule.",
        });
      }
      groupRules.set(criterion.groupKey, criterion.groupRule);
    });
  });

export const jdStructureProviderOutputSchema = z
  .object({
    jdTranslationZh: unicodeBoundedText(1, 100_000),
    requirements: z.array(jdStructureRequirementSchema).max(80),
  })
  .strict()
  .superRefine((output, context) => {
    const requirementKeys = new Set<string>();
    const criterionKeys = new Set<string>();

    output.requirements.forEach((requirement, requirementIndex) => {
      if (requirementKeys.has(requirement.key)) {
        context.addIssue({
          code: "custom",
          path: ["requirements", requirementIndex, "key"],
          message: "Requirement keys must be unique.",
        });
      }
      requirementKeys.add(requirement.key);

      requirement.criteria.forEach((criterion, criterionIndex) => {
        if (criterionKeys.has(criterion.key)) {
          context.addIssue({
            code: "custom",
            path: ["requirements", requirementIndex, "criteria", criterionIndex, "key"],
            message: "Criterion keys must be unique across the output.",
          });
        }
        criterionKeys.add(criterion.key);
      });
    });
  });

export const jdGapCriterionAssessmentSchema = z
  .object({
    criterionId: z.uuid(),
    resumeEvidenceStatus: criterionEvidenceStatusSchema,
    resumeExcerpt: unicodeBoundedText(1, 1000).nullable(),
    profileFactIds: z.array(z.uuid()).max(5),
    gapType: gapTypeSchema,
    reasonZh: unicodeBoundedText(1, 700),
    userQuestionZh: unicodeBoundedText(1, 500).nullable(),
  })
  .strict();

export const jdGapComparisonOutputSchema = z
  .object({
    assessments: z.array(jdGapCriterionAssessmentSchema).max(960),
  })
  .strict();

export type CriterionKind = z.infer<typeof criterionKindSchema>;
export type RequirementType = z.infer<typeof requirementTypeSchema>;
export type CriterionGroupRule = z.infer<typeof criterionGroupRuleSchema>;
export type CriterionEvidenceStatus = z.infer<
  typeof criterionEvidenceStatusSchema
>;
export type CoverageStatus = z.infer<typeof coverageStatusSchema>;
export type ImpactLevel = z.infer<typeof impactLevelSchema>;
export type GapType = z.infer<typeof gapTypeSchema>;
export type CriterionConstraint = z.infer<typeof criterionConstraintSchema>;
export type JDStructureCriterion = z.infer<typeof jdStructureCriterionSchema>;
export type JDStructureRequirement = z.infer<
  typeof jdStructureRequirementSchema
>;
export type JDStructureProviderOutput = z.infer<
  typeof jdStructureProviderOutputSchema
>;
export type JDGapCriterionAssessment = z.infer<
  typeof jdGapCriterionAssessmentSchema
>;
export type JDGapComparisonOutput = z.infer<
  typeof jdGapComparisonOutputSchema
>;

export type JDStructureInput = {
  jdText: string;
};

export type JDGapCriterionForComparison = Omit<
  JDStructureCriterion,
  "key"
> & {
  id: string;
  sortOrder: number;
};

export type JDGapRequirementForComparison = Omit<
  JDStructureRequirement,
  "key" | "criteria"
> & {
  id: string;
  sortOrder: number;
  criteria: JDGapCriterionForComparison[];
};

export type JDGapComparisonInput = {
  resumeText: string;
  requirements: JDGapRequirementForComparison[];
  confirmedFacts: ConfirmedFactForAnalysis[];
};

export type JDGapRequirementResult = {
  requirementId: string;
  coverageStatus: CoverageStatus;
  impactLevel: ImpactLevel;
  coveredCriterionCount: number;
  missingCriterionCount: number;
  sourceOrder: number;
};
