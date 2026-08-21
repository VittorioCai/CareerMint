import { extractDocxText } from "./docx";
import { normalizeResumeText } from "./normalize";
import { extractPdfText } from "./pdf";

export { normalizeResumeText } from "./normalize";

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
