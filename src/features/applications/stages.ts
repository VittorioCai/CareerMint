/**
 * The stage and workplace vocabularies, with nothing else in the module.
 *
 * They live apart from `schemas.ts` because a client component needs them as
 * *values* — the stage `<select>` maps over them — and `schemas.ts` imports
 * zod. Importing a seven-string tuple from there put all 287 KB of zod in the
 * browser to render seven `<option>` elements.
 *
 * Keeping them here rather than duplicating them means `schemas.ts` still
 * derives its enums from the same source, so the two can never drift.
 */
export const APPLICATION_STAGES = [
  "preparing",
  "applied",
  "hr",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export const WORKPLACE_MODES = [
  "unspecified",
  "onsite",
  "hybrid",
  "remote",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];
export type WorkplaceMode = (typeof WORKPLACE_MODES)[number];
