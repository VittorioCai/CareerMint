// @vitest-environment node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extractResumeText, normalizeResumeText } from "./index";

describe("extractResumeText", () => {
  it("extracts English PDF text", async () => {
    const buffer = await readFile(
      join(process.cwd(), "tests/fixtures/resume-en.pdf"),
    );
    const text = await extractResumeText(buffer, "application/pdf");

    expect(text).toContain("Product Analyst");
    expect(text).toContain("18%");
  });

  it("extracts Chinese DOCX text", async () => {
    const buffer = await readFile(
      join(process.cwd(), "tests/fixtures/resume-zh.docx"),
    );
    const text = await extractResumeText(
      buffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    expect(text).toContain("数据分析师");
    expect(text).toContain("30%");
  });

  it("rejects implausibly short or oversized extracted text", () => {
    expect(() => normalizeResumeText("too short")).toThrow(
      "resume-text-too-short",
    );
    expect(() => normalizeResumeText("x".repeat(100_001))).toThrow(
      "resume-text-too-long",
    );
  });
});
