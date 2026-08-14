// @vitest-environment node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  buildResumeDocx,
  buildResumePdf,
  type ResumeExportDocument,
} from "./document";

const fixture: ResumeExportDocument = {
  candidateName: "Jordan Lee",
  email: "jordan@example.com",
  companyName: "Acme GmbH",
  roleTitle: "Product Manager",
  versionNumber: 2,
  template: "modern",
  items: [
    {
      section: "summary",
      content:
        "Product manager focused on evidence-led discovery and measurable customer outcomes.",
    },
    {
      section: "achievement",
      content:
        "Improved checkout conversion by 18% through SQL-led funnel analysis.",
    },
    {
      section: "skills",
      content: "SQL, funnel analysis, product discovery",
    },
  ],
};

describe("resume document export", () => {
  it("builds a Letter DOCX with explicit geometry, real bullets, and snapshot content", async () => {
    const buffer = await buildResumeDocx(fixture);
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const stylesXml = await zip.file("word/styles.xml")!.async("string");
    const numberingXml = await zip.file("word/numbering.xml")!.async("string");

    expect(documentXml).toContain("Jordan Lee");
    expect(documentXml).toContain("Improved checkout conversion by 18%");
    expect(documentXml).toContain('w:pgSz w:w="12240" w:h="15840"');
    expect(documentXml).toContain('w:pgMar w:top="1008"');
    expect(stylesXml).toContain("ResumeSectionHeading");
    expect(numberingXml).toContain('w:numFmt w:val="bullet"');
    expect(documentXml).not.toContain("factSnapshot");
    expect(documentXml).not.toContain("创建时已确认");
    expect(documentXml).not.toContain("CareerMint");
  });

  it("builds a readable PDF with the same immutable content", async () => {
    const bytes = await buildResumePdf(fixture);
    const pdf = await PDFDocument.load(bytes);

    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.getPageCount()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("paginates long exports and can write visual-QA fixtures", async () => {
    const longFixture: ResumeExportDocument = {
      ...fixture,
      template: "simple",
      items: Array.from({ length: 34 }, (_, index) => ({
        section: index % 2 === 0 ? "experience" : "project",
        content: `Evidence-backed resume item ${index + 1}: led cross-functional discovery and documented measurable customer outcomes across a complex international workflow.`,
      })),
    };
    const [docx, pdfBytes] = await Promise.all([
      buildResumeDocx(longFixture),
      buildResumePdf(longFixture),
    ]);
    const pdf = await PDFDocument.load(pdfBytes);

    expect(pdf.getPageCount()).toBe(2);

    const qaDirectory = process.env.RESUME_EXPORT_QA_DIR;
    if (qaDirectory) {
      await mkdir(qaDirectory, { recursive: true });
      const [modernDocx, modernPdf] = await Promise.all([
        buildResumeDocx(fixture),
        buildResumePdf(fixture),
      ]);
      await Promise.all([
        writeFile(path.join(qaDirectory, "resume-simple.docx"), docx),
        writeFile(path.join(qaDirectory, "resume-simple.pdf"), pdfBytes),
        writeFile(path.join(qaDirectory, "resume-modern.docx"), modernDocx),
        writeFile(path.join(qaDirectory, "resume-modern.pdf"), modernPdf),
      ]);
    }
  });

  it("rejects unsupported PDF characters while keeping DOCX generation available", async () => {
    const unicodeFixture = { ...fixture, candidateName: "李明" };

    await expect(buildResumePdf(unicodeFixture)).rejects.toThrow(
      "pdf-unsupported-characters",
    );
    await expect(buildResumeDocx(unicodeFixture)).resolves.toBeInstanceOf(
      Buffer,
    );
  });
});
