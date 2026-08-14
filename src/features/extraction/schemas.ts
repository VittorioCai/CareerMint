import { z } from "zod";

import {
  careerFactDataSchema,
  factTypeSchema,
} from "@/features/career-profile/schemas";

export const extractedFactSchema = z.object({
  factType: factTypeSchema,
  data: careerFactDataSchema,
  sourceExcerpt: z.string().min(1).max(1000),
  needsDetailReason: z.string().trim().min(1).max(500).nullable(),
});

export const resumeExtractionSchema = z.object({
  facts: z.array(extractedFactSchema).max(100),
});

export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;
