import { extractDocxText } from "./docx";
import { extractPdfText } from "./pdf";

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
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

export async function extractResumeText(buffer: Buffer, contentType: string) {
  let extracted: string;

  if (contentType === PDF_MIME) {
    extracted = await extractPdfText(buffer);
  } else if (contentType === DOCX_MIME) {
    extracted = await extractDocxText(buffer);
  } else {
    throw new Error("unsupported-content-type");
  }

  return normalizeResumeText(extracted);
}
