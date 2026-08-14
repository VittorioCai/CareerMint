import { mkdir, writeFile } from "node:fs/promises";

import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";

await mkdir("tests/fixtures", { recursive: true });

const pdf = await PDFDocument.create();
const page = pdf.addPage([612, 792]);
const font = await pdf.embedFont(StandardFonts.Helvetica);
page.drawText("Product Analyst", { x: 72, y: 720, size: 18, font });
page.drawText(
  "Improved checkout conversion by 18% through funnel analysis.",
  { x: 72, y: 690, size: 11, font },
);
await writeFile("tests/fixtures/resume-en.pdf", await pdf.save());

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph("数据分析师"),
        new Paragraph("通过自动化将周报制作时间缩短 30%"),
        new Paragraph("使用 SQL 与 Python 清洗多个数据来源，并建立可复用的数据质量检查流程。"),
      ],
    },
  ],
});
await writeFile("tests/fixtures/resume-zh.docx", await Packer.toBuffer(doc));
