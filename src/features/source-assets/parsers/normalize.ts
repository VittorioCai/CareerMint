const MIN_TEXT_LENGTH = 40;
const MAX_TEXT_LENGTH = 100_000;

export function normalizeResumeText(rawText: string) {
  const normalized = rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length < MIN_TEXT_LENGTH) {
    throw new Error("resume-text-too-short");
  }
  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new Error("resume-text-too-long");
  }
  return normalized;
}
