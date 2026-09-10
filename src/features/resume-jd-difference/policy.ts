import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import type { DifferenceIssue } from "./schemas";

export const STRICT_EVIDENCE_KINDS = [
  "tool",
  "framework",
  "cloud",
  "method",
  "years",
  "number",
  "language_level",
  "degree_level",
  "certificate",
  "license",
  "work_authorization",
  "management_scope",
  "result",
] as const;

export type StrictEvidenceKind = (typeof STRICT_EVIDENCE_KINDS)[number];
export type SemanticAlignment =
  | "direct"
  | "candidate-semantic-alignment"
  | "no-evidence";

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

export function isStrictlyEquivalent(expected: string, actual: string) {
  return normalize(expected) === normalize(actual);
}

const responsibilityLanguageGroups = [
  ["dashboard", "reporting", "visualization"],
  [
    "requirements gathering",
    "business analysis",
    "translate business needs into technical requirements",
  ],
  ["api development", "backend services", "service implementation"],
] as const;

function sharesResponsibilityLanguage(left: string, right: string) {
  return responsibilityLanguageGroups.some(
    (group) =>
      group.some((term) => left.includes(term)) &&
      group.some((term) => right.includes(term)),
  );
}

export function classifySemanticAlignment(input: {
  jdTerm: string;
  resumeExcerpt: string | null;
  strictKind: StrictEvidenceKind | null;
}): SemanticAlignment {
  if (!input.resumeExcerpt?.trim()) return "no-evidence";
  if (isStrictlyEquivalent(input.jdTerm, input.resumeExcerpt)) return "direct";

  const jd = normalize(input.jdTerm);
  const resume = normalize(input.resumeExcerpt);
  if (resume.includes(jd) || jd.includes(resume)) return "direct";
  if (input.strictKind) return "no-evidence";

  if (sharesResponsibilityLanguage(jd, resume)) {
    return "candidate-semantic-alignment";
  }
  if (
    jd.includes("stakeholder") &&
    /\bbusiness (?:team|teams|partner|partners)\b/u.test(resume) &&
    /\b(?:need|needs|requirement|requirements|presented|findings|reporting)\b/u.test(
      resume,
    )
  ) {
    return "candidate-semantic-alignment";
  }

  return "no-evidence";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function findExactExcerpt(document: string, candidate: string) {
  const tokens = candidate.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return null;
  const pattern = tokens.map(escapeRegExp).join("\\s+");
  return new RegExp(pattern, "iu").exec(document)?.[0] ?? null;
}

export function verifyConfirmedFactIds(
  candidateIds: string[],
  confirmedFacts: ConfirmedFactForAnalysis[],
) {
  const confirmedIds = new Set(confirmedFacts.map(({ id }) => id));
  return [...new Set(candidateIds.filter((id) => confirmedIds.has(id)))];
}

/**
 * Vocabulary that addresses the reader about what to go and check.
 *
 * Any direction that tells the reader to do something is, by definition, not
 * a line they can paste — so this is the cheap exit before the shape checks
 * below run at all.
 */
const READER_INSTRUCTION =
  /(核对|补充|确认|说明|检查|回查|不要|不能|不该|无法|属于|请|是否|可以)|\b(check|verify|confirm|add|name|state|describe|explain|make sure|do not|don't|avoid|consider|review|include|spell out|point at|cannot|if you|you)\b/iu;

/**
 * A resume bullet's opening: a past-tense action verb, or the candidate
 * speaking about themselves.
 *
 * This replaces "any Latin-script sentence", which was only ever a proxy for
 * "this direction is not in the output language" — true while every direction
 * was Chinese, and catastrophic the moment the model answers in English,
 * because then every legitimate direction is a Latin-script sentence and the
 * whole paid run is thrown away.
 *
 * Precision over recall on purpose. A false positive discards a finished
 * analysis the user has already paid for; a false negative costs one
 * suggestion that reads a little too finished. So this asks for a positive
 * sign of a resume claim rather than for the absence of advice.
 */
const RESUME_CLAIM_OPENER =
  /^(?:[A-Z][a-z]+(?:ed|wn|ne)\b|(?:Led|Built|Ran|Drove|Grew|Won|Set|Made|Took|Wrote|Sold|Cut|Held|Kept|Sent|Spoke|Taught|Oversaw|Rebuilt|Shipped)\b|(?:负责|主导|完成|实现|提升|搭建|带领|推动|优化|独立))/u;
const FIRST_PERSON = /\b(?:I|my|we|our)\b/u;

/**
 * A direction that reads as a finished claim rather than as advice.
 *
 * "Collaborated with business stakeholders to align reporting needs and
 * delivered weekly dashboards." is a resume bullet: it opens on a past-tense
 * verb, runs to a full stop, and says nothing to the reader about what to do.
 * The product never hands over a line to paste, so this disqualifies the run.
 */
export function isPasteReadyRewrite(value: string) {
  const trimmed = value.trim();
  if (READER_INSTRUCTION.test(trimmed)) return false;
  if (!RESUME_CLAIM_OPENER.test(trimmed) && !FIRST_PERSON.test(trimmed)) {
    return false;
  }
  // A Chinese sentence has no spaces to count, so its length is its
  // characters — one CJK glyph carries about as much as an English word.
  const length = /\p{Script=Han}/u.test(trimmed)
    ? trimmed.replaceAll(/[\s，。、；：]/gu, "").length
    : (trimmed.match(/[\p{L}\p{N}+#.-]+/gu) ?? []).length;
  return length >= 8 && /[.!?。！？]$/u.test(trimmed);
}

const priorityOrder: Record<DifferenceIssue["priority"], number> = {
  critical: 0,
  important: 1,
  minor: 2,
};

export function sortDifferenceIssues(issues: DifferenceIssue[]) {
  return issues
    .filter(({ isGate }) => !isGate)
    .toSorted(
      (left, right) =>
        priorityOrder[left.priority] - priorityOrder[right.priority],
    );
}
