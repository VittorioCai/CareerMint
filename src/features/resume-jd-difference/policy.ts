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

export function isPasteReadyRewrite(value: string) {
  if (/\p{Script=Han}/u.test(value)) return false;
  const words = value.match(/[\p{L}\p{N}+#.-]+/gu) ?? [];
  return words.length >= 8 && /[.!?]$/u.test(value.trim());
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
