import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import type { Dictionary } from "@/i18n/dictionaries/en";

import type {
  DifferenceIssue,
  ImprovementDirection,
  ResumeJDDifferenceOutput,
} from "./schemas";

/**
 * The labels a Markdown export needs, in the language of the *run* — not of
 * whoever is downloading it.
 *
 * A stored analysis is written in one language and can be exported months
 * later by a reader who has since switched. Taking the labels from the
 * reader's dictionary would print English headings over Chinese findings, so
 * the caller resolves this from the run's `outputLocale`.
 *
 * The authenticity, section and focus labels are the ones the improvements
 * panel already shows on screen: an export that renamed them would describe
 * the same analysis in two vocabularies.
 */
export type ResumeJDDifferenceMarkdownCopy = {
  markdown: Dictionary["difference"]["markdown"];
  noEvidence: Dictionary["difference"]["noEvidence"];
  authenticity: Dictionary["improvements"]["authenticity"];
  targetSections: Dictionary["improvements"]["targetSections"];
  focusAreas: Dictionary["improvements"]["focusAreas"];
  verifyExperience: Dictionary["improvements"]["verifyExperience"];
};

export function markdownCopyFromDictionary(
  dictionary: Dictionary,
): ResumeJDDifferenceMarkdownCopy {
  return {
    markdown: dictionary.difference.markdown,
    noEvidence: dictionary.difference.noEvidence,
    authenticity: dictionary.improvements.authenticity,
    targetSections: dictionary.improvements.targetSections,
    focusAreas: dictionary.improvements.focusAreas,
    verifyExperience: dictionary.improvements.verifyExperience,
  };
}

export type ResumeJDDifferenceMarkdownInput = {
  companyName: string;
  roleTitle: string;
  exportedAt: Date;
  sourceFilename: string;
  stale: boolean;
  result: ResumeJDDifferenceOutput;
  facts: ConfirmedFactForAnalysis[];
  copy: ResumeJDDifferenceMarkdownCopy;
};

function escapeMarkdown(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\\/gu, "\\\\")
    .replace(/([`*_{}\[\]<>#+!|~-])/gu, "\\$1")
    .replace(/\s*\n\s*/gu, "<br>")
    .replace(/[\t ]+/gu, " ")
    .trim();
}

function safeDocumentName(value: string) {
  const name = value.replaceAll("\\", "/").split("/").pop() ?? "";
  return escapeMarkdown(name || "resume");
}

function issueBlock(
  issue: DifferenceIssue,
  index: number,
  factsById: Map<string, ConfirmedFactForAnalysis>,
  copy: ResumeJDDifferenceMarkdownCopy,
) {
  const labels = copy.markdown;
  const sep = labels.labelSeparator;
  // Ids can outlive the fact they point at; name only the ones still confirmed.
  const citedTitles = issue.profileFactIds
    .map((id) => factsById.get(id)?.title)
    .filter((title): title is string => title !== undefined);
  return [
    `### ${index + 1}. ${escapeMarkdown(issue.jdTranslation)}`,
    "",
    `- ${labels.jdOriginal}${sep}${escapeMarkdown(issue.jdOriginal)}`,
    `- ${labels.explanation}${sep}${escapeMarkdown(issue.jdTranslation)}`,
    `- ${labels.resumeStatus}${sep}${escapeMarkdown(issue.resumeStatus)}`,
    `- ${labels.resumeQuote}${sep}${escapeMarkdown(issue.resumeExcerpt ?? copy.noEvidence)}`,
    `- ${labels.problem}${sep}${escapeMarkdown(issue.problem)}`,
    `- ${labels.reason}${sep}${escapeMarkdown(issue.reason)}`,
    `- ${labels.priority}${sep}${escapeMarkdown(issue.priority)}`,
    `- ${labels.authenticity}${sep}${escapeMarkdown(copy.authenticity[issue.authenticity])}`,
    ...(citedTitles.length
      ? [`- ${labels.profileEvidence}${sep}${citedTitles.map(escapeMarkdown).join(" · ")}`]
      : []),
    "",
  ];
}

function directionBlock(
  direction: ImprovementDirection,
  issue: DifferenceIssue | undefined,
  index: number,
  copy: ResumeJDDifferenceMarkdownCopy,
) {
  const labels = copy.markdown;
  const sep = labels.labelSeparator;
  const section = copy.targetSections[direction.targetSection];
  const target = direction.targetExperience
    ? `${section} · ${direction.targetExperience}`
    : section;
  const terms =
    direction.authenticity === "unsupported"
      ? []
      : [...new Set([...direction.jdTerms, ...direction.synonymousJobLanguage])];
  return [
    `### ${index + 1}. ${escapeMarkdown(issue?.jdTranslation ?? labels.correspondingDifference)}`,
    "",
    `- ${labels.targetLocation}${sep}${escapeMarkdown(target)}`,
    `- ${labels.focus}${sep}${escapeMarkdown(direction.focusAreas.map((area) => copy.focusAreas[area]).join(" · ") || copy.verifyExperience)}`,
    ...(terms.length
      ? [`- ${labels.jobTerms}${sep}${terms.map(escapeMarkdown).join(labels.listSeparator)}`]
      : []),
    `- ${labels.authenticity}${sep}${escapeMarkdown(copy.authenticity[direction.authenticity])}`,
    `- ${labels.directionNote}${sep}${escapeMarkdown(direction.direction)}`,
    ...(direction.authenticity === "unsupported"
      ? [`- ${labels.unsupportedWarning}`]
      : []),
    "",
  ];
}

function jobCore(
  result: ResumeJDDifferenceOutput,
  copy: ResumeJDDifferenceMarkdownCopy,
) {
  return [
    `## ${copy.markdown.jobCoreHeading}`,
    "",
    escapeMarkdown(result.jobCore.mission),
    "",
    ...result.jobCore.coreCapabilities.map(
      (capability) => `- ${escapeMarkdown(capability)}`,
    ),
    "",
  ];
}

export function buildResumeJDDifferenceMarkdown(
  input: ResumeJDDifferenceMarkdownInput,
) {
  const copy = input.copy;
  const labels = copy.markdown;
  const sep = labels.labelSeparator;
  const factsById = new Map(input.facts.map((fact) => [fact.id, fact]));
  const issues = input.result.issues.filter((issue) => !issue.isGate);
  const gates = input.result.issues.filter((issue) => issue.isGate);
  const issueById = new Map(input.result.issues.map((issue) => [issue.id, issue]));
  const lines = [
    `# ${escapeMarkdown(input.companyName)} · ${escapeMarkdown(input.roleTitle)} — ${labels.titleSuffix}`,
    "",
    `- ${labels.exportedAt}${sep}${input.exportedAt.toISOString()}`,
    `- ${labels.comparisonResume}${sep}${safeDocumentName(input.sourceFilename)}`,
    `- ${labels.resultState}${sep}${input.stale ? labels.stale : labels.fresh}`,
    "",
    ...jobCore(input.result, copy),
    `## ${labels.overallHeading}`,
    "",
    escapeMarkdown(input.result.overallDifference.summary),
    "",
    `## ${labels.allDifferencesHeading}`,
    "",
    ...(issues.length
      ? issues.flatMap((issue, index) => issueBlock(issue, index, factsById, copy))
      : [labels.noIssues, ""]),
    `## ${labels.gatesHeading}`,
    "",
    ...(gates.length
      ? gates.flatMap((gate, index) => issueBlock(gate, index, factsById, copy))
      : [labels.noGates, ""]),
    `## ${labels.directionsHeading}`,
    "",
    ...(input.result.directions.length
      ? input.result.directions.flatMap((direction, index) =>
          directionBlock(direction, issueById.get(direction.issueId), index, copy),
        )
      : [labels.noDirections, ""]),
    `## ${labels.matchedHeading}`,
    "",
    ...input.result.matched.flatMap((item, index) => [
      `### ${index + 1}. ${escapeMarkdown(item.jdTranslation)}`,
      "",
      `- ${labels.jdOriginal}${sep}${escapeMarkdown(item.jdOriginal)}`,
      `- ${labels.resumeQuote}${sep}${escapeMarkdown(item.resumeExcerpt)}`,
      `- ${labels.reason}${sep}${escapeMarkdown(item.reason)}`,
      `- ${labels.authenticity}${sep}${copy.authenticity.supported}`,
      "",
    ]),
  ];
  if (!input.result.matched.length) lines.push(labels.noMatched, "");
  return `${lines.join("\n").trim()}\n`;
}

export function safeResumeJDDifferenceMarkdownFilename(
  companyName: string,
  roleTitle: string,
) {
  const base = `${companyName}-${roleTitle}`
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .replace(/[\\/:*?"<>|]/gu, "-")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 160)
    .replace(/-$/gu, "");
  return `${base || "application"}-difference-analysis.md`;
}
