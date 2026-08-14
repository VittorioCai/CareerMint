import { z } from "zod";

export const factTypeSchema = z.enum([
  "summary",
  "work_experience",
  "education",
  "project",
  "skill",
  "certification",
  "language",
  "achievement",
  "story",
]);

export const factStatusSchema = z.enum([
  "pending",
  "confirmed",
  "needs_detail",
]);

const partialDateSchema = z.string().regex(/^\d{4}(-\d{2})?$/).nullable();

export const careerFactDataSchema = z.object({
  title: z.string().trim().min(1).max(160),
  organization: z.string().trim().max(160).nullable(),
  startDate: partialDateSchema,
  endDate: partialDateSchema,
  description: z.string().trim().min(1).max(4000),
  skills: z.array(z.string().trim().min(1).max(80)).max(30),
});

export const careerFactInputSchema = z.object({
  factType: factTypeSchema,
  data: careerFactDataSchema,
});

export type CareerFactInput = z.infer<typeof careerFactInputSchema>;

export type CareerFact = {
  id: string;
  userId: string;
  sourceAssetId: string | null;
  factType: z.infer<typeof factTypeSchema>;
  data: z.infer<typeof careerFactDataSchema>;
  sourceExcerpt: string | null;
  confirmationStatus: z.infer<typeof factStatusSchema>;
  confirmedAt: string | null;
};

export function buildCareerFactUpdate(input: CareerFactInput) {
  return {
    fact_type: input.factType,
    data: input.data,
    confirmation_status: "pending" as const,
    confirmed_at: null,
  };
}

export function transitionFactStatus(
  from: z.infer<typeof factStatusSchema>,
  to: z.infer<typeof factStatusSchema>,
  explicitConfirmation: boolean,
): { ok: true } | { ok: false; reason: string } {
  if (to === "confirmed" && !explicitConfirmation) {
    return { ok: false, reason: "explicit-confirmation-required" };
  }

  if (from === "confirmed" && to === "pending") {
    return { ok: false, reason: "confirmed-facts-cannot-return-to-pending" };
  }

  return { ok: true };
}
