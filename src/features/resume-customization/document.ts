import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type { ResumeSection } from "./schemas";

export type ResumeExportDocument = {
  candidateName: string;
  email: string;
  companyName: string;
  roleTitle: string;
  versionNumber: number;
  template: "simple" | "modern";
  items: Array<{ section: ResumeSection; content: string }>;
};

const sectionOrder: ResumeSection[] = [
  "summary",
  "experience",
  "achievement",
  "project",
  "education",
  "skills",
  "certification",
  "language",
];

const sectionLabels: Record<ResumeSection, string> = {
  summary: "PROFESSIONAL SUMMARY",
  experience: "EXPERIENCE",
  project: "PROJECTS",
  education: "EDUCATION",
  skills: "SKILLS",
  certification: "CERTIFICATIONS",
  language: "LANGUAGES",
  achievement: "SELECTED ACHIEVEMENTS",
};

const pageWidthTwips = 12_240;
const pageHeightTwips = 15_840;
const resumeMarginTwips = 1_008;
const inkHex = "293733";
const mutedHex = "596761";
const mintHex = "55A982";

function groupedItems(document: ResumeExportDocument) {
  return sectionOrder
    .map((section) => ({
      section,
      items: document.items.filter((item) => item.section === section),
    }))
    .filter((group) => group.items.length > 0);
}

export async function buildResumeDocx(
  input: ResumeExportDocument,
): Promise<Buffer> {
  const accent = input.template === "modern" ? mintHex : inkHex;
  const children: Paragraph[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: input.candidateName,
          bold: true,
          color: inkHex,
          font: "Aptos Display",
          size: 48,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `${input.roleTitle} | ${input.companyName}`,
          bold: true,
          color: accent,
          font: "Aptos",
          size: 22,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 220 },
      children: [
        new TextRun({
          text: input.email,
          color: mutedHex,
          font: "Aptos",
          size: 19,
        }),
      ],
    }),
  ];

  for (const group of groupedItems(input)) {
    children.push(
      new Paragraph({
        style: "ResumeSectionHeading",
        children: [new TextRun(sectionLabels[group.section])],
      }),
    );
    for (const item of group.items) {
      const isProse = group.section === "summary";
      children.push(
        new Paragraph({
          keepLines: true,
          keepNext: false,
          spacing: { after: 80, line: 276, lineRule: "auto" },
          numbering: isProse
            ? undefined
            : { reference: "resume-bullets", level: 0 },
          children: [
            new TextRun({
              text: item.content,
              color: inkHex,
              font: "Aptos",
              size: 21,
            }),
          ],
        }),
      );
    }
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Aptos", size: 21, color: inkHex },
          paragraph: { spacing: { after: 80, line: 276, lineRule: "auto" } },
        },
      },
      paragraphStyles: [
        {
          id: "ResumeSectionHeading",
          name: "Resume Section Heading",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            bold: true,
            font: "Aptos",
            size: 22,
            color: accent,
          },
          paragraph: {
            keepNext: true,
            spacing: { before: 180, after: 100, line: 276, lineRule: "auto" },
            border: {
              bottom: {
                color: accent,
                style: BorderStyle.SINGLE,
                size: 8,
                space: 4,
              },
            },
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "resume-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 360, hanging: 180 },
                },
                run: { font: "Aptos", color: accent, size: 19 },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: pageWidthTwips, height: pageHeightTwips },
            margin: {
              top: resumeMarginTwips,
              right: resumeMarginTwips,
              bottom: resumeMarginTwips,
              left: resumeMarginTwips,
              header: 708,
              footer: 708,
              gutter: 0,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

const pdfWidth = 612;
const pdfHeight = 792;
const pdfMargin = 50.4;

function assertPdfCharacters(font: PDFFont, values: string[]) {
  try {
    for (const value of values) font.encodeText(value);
  } catch {
    throw new Error("pdf-unsupported-characters");
  }
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const proposed = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(proposed, size) <= maxWidth) {
      current = proposed;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }

    let chunk = "";
    for (const character of word) {
      const proposedChunk = chunk + character;
      if (font.widthOfTextAtSize(proposedChunk, size) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = proposedChunk;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawLines(input: {
  page: PDFPage;
  lines: string[];
  x: number;
  y: number;
  font: PDFFont;
  size: number;
  lineHeight: number;
  color: ReturnType<typeof rgb>;
}) {
  let y = input.y;
  for (const line of input.lines) {
    input.page.drawText(line, {
      x: input.x,
      y,
      font: input.font,
      size: input.size,
      color: input.color,
    });
    y -= input.lineHeight;
  }
  return y;
}

export async function buildResumePdf(
  input: ResumeExportDocument,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const allText = [
    input.candidateName,
    input.email,
    input.companyName,
    input.roleTitle,
    ...input.items.map((item) => item.content),
  ];
  assertPdfCharacters(regular, allText);

  const ink = rgb(41 / 255, 55 / 255, 51 / 255);
  const muted = rgb(89 / 255, 103 / 255, 97 / 255);
  const accent =
    input.template === "modern"
      ? rgb(85 / 255, 169 / 255, 130 / 255)
      : ink;
  const contentWidth = pdfWidth - pdfMargin * 2;
  let page = pdf.addPage([pdfWidth, pdfHeight]);
  let y = pdfHeight - pdfMargin;

  function newPage() {
    page = pdf.addPage([pdfWidth, pdfHeight]);
    y = pdfHeight - pdfMargin;
    page.drawText(input.candidateName, {
      x: pdfMargin,
      y,
      font: bold,
      size: 9,
      color: muted,
    });
    y -= 24;
  }

  function ensureSpace(height: number) {
    if (y - height < pdfMargin + 20) newPage();
  }

  function drawSectionHeading(label: string) {
    page.drawText(label, {
      x: pdfMargin,
      y,
      font: bold,
      size: 10.5,
      color: accent,
    });
    y -= 6;
    page.drawLine({
      start: { x: pdfMargin, y },
      end: { x: pdfWidth - pdfMargin, y },
      thickness: input.template === "modern" ? 1.25 : 0.8,
      color: accent,
    });
    y -= 16;
  }

  page.drawText(input.candidateName, {
    x: pdfMargin,
    y,
    font: bold,
    size: 24,
    color: ink,
  });
  y -= 30;
  page.drawText(`${input.roleTitle} | ${input.companyName}`, {
    x: pdfMargin,
    y,
    font: bold,
    size: 11,
    color: accent,
  });
  y -= 18;
  page.drawText(input.email, {
    x: pdfMargin,
    y,
    font: regular,
    size: 9.5,
    color: muted,
  });
  y -= 28;

  for (const group of groupedItems(input)) {
    const firstItem = group.items[0];
    const firstLines = wrapText(
      firstItem.content,
      regular,
      10.5,
      contentWidth - (group.section === "summary" ? 0 : 14),
    );
    ensureSpace(27 + firstLines.length * 13.5 + 4.5);
    drawSectionHeading(sectionLabels[group.section]);

    for (const [index, item] of group.items.entries()) {
      const isProse = group.section === "summary";
      const bulletIndent = isProse ? 0 : 14;
      const lines = wrapText(
        item.content,
        regular,
        10.5,
        contentWidth - bulletIndent,
      );
      const itemHeight = lines.length * 13.5 + 4.5;
      if (y - itemHeight < pdfMargin + 20) {
        newPage();
        if (index > 0) {
          drawSectionHeading(`${sectionLabels[group.section]} (CONTINUED)`);
        }
      }
      if (!isProse) {
        page.drawCircle({
          x: pdfMargin + 3,
          y: y + 4,
          size: 1.7,
          color: accent,
        });
      }
      y = drawLines({
        page,
        lines,
        x: pdfMargin + bulletIndent,
        y,
        font: regular,
        size: 10.5,
        lineHeight: 13.5,
        color: ink,
      });
      y -= 4.5;
    }
    y -= 5;
  }

  return pdf.save({ useObjectStreams: false });
}
