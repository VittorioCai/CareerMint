import { z } from "zod";

import { factTypeSchema } from "./schemas";

/**
 * A confirmed career fact, in the shape the AI features are given it.
 *
 * This used to live in `@/features/jd-analysis` — a module named after a
 * pipeline `b93d240` deleted. It is the input every live AI feature is built
 * on: the difference analysis, its Markdown export, and interview
 * preparation. Reading `from "@/features/jd-analysis/schemas"` in the
 * difference workflow suggested that pipeline was still involved in it.
 *
 * Narrower than the stored fact on purpose. A model is shown the seven fields
 * it needs to reason and nothing else — no timestamps, no storage paths, no
 * confirmation state, because an unconfirmed fact never gets this far.
 *
 * No `server-only` here, deliberately. The schema and the type are what the
 * fingerprint, the policy rules and the panels all need; marking the module
 * server-only would make every one of them unimportable in a plain test. The
 * database read that produces these lives in `./repository`, which is
 * server-only for its own reasons.
 */
export const confirmedFactForAnalysisSchema = z.object({
  id: z.uuid(),
  factType: factTypeSchema,
  title: z.string().trim().min(1).max(160),
  organization: z.string().trim().min(1).max(160).nullable(),
  description: z.string().trim().min(1).max(4000),
  skills: z.array(z.string().trim().min(1).max(80)).max(30),
  sourceExcerpt: z.string().trim().min(1).max(1000).nullable(),
});

export type ConfirmedFactForAnalysis = z.infer<
  typeof confirmedFactForAnalysisSchema
>;

/**
 * A stored fact narrowed to what analysis may see, or nothing.
 *
 * Two filters, and both matter. An unconfirmed fact returns `null` because
 * the product's rule is that AI only ever reasons from facts the user has
 * signed off. A fact that fails the schema also returns `null` rather than
 * throwing: one malformed row must not take down a whole analysis.
 */
export function toConfirmedFactForAnalysis(input: {
  id: string;
  factType: string;
  data: {
    title: string;
    organization: string | null;
    description: string;
    skills: string[];
  };
  sourceExcerpt: string | null;
  confirmationStatus: string;
}): ConfirmedFactForAnalysis | null {
  if (input.confirmationStatus !== "confirmed") return null;
  const parsed = confirmedFactForAnalysisSchema.safeParse({
    id: input.id,
    factType: input.factType,
    title: input.data.title,
    organization: input.data.organization,
    description: input.data.description,
    skills: input.data.skills,
    sourceExcerpt: input.sourceExcerpt,
  });
  return parsed.success ? parsed.data : null;
}
