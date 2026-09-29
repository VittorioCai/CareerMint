// @vitest-environment node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

const { extractRawText } = vi.hoisted(() => ({
  extractRawText: vi.fn().mockResolvedValue({ value: "text" }),
}));

vi.mock("mammoth", () => ({ default: { extractRawText } }));

import {
  declaredDocxSize,
  extractDocxText,
  MAX_DOCX_ENTRIES,
  MAX_DOCX_UNCOMPRESSED_BYTES,
} from "./docx";

const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

async function archive(files: Record<string, string>) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function offsetOf(buffer: Buffer, signature: number) {
  for (let offset = 0; offset <= buffer.length - 4; offset += 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error("signature-not-found");
}

describe("what a .docx says it unpacks to", () => {
  it("adds up a real document without inflating it", async () => {
    const buffer = await readFile(
      join(process.cwd(), "tests/fixtures/resume-zh.docx"),
    );

    const declared = declaredDocxSize(buffer);

    expect(declared.entries).toBeGreaterThan(0);
    expect(declared.uncompressedBytes).toBeGreaterThan(buffer.length / 10);
    expect(declared.uncompressedBytes).toBeLessThan(1024 * 1024);
  });

  it("counts every entry", async () => {
    const buffer = await archive({ "a.xml": "x".repeat(1000), "b.xml": "y".repeat(500) });

    expect(declaredDocxSize(buffer)).toEqual({
      entries: 2,
      uncompressedBytes: 1500,
    });
  });

  it("refuses an archive that unpacks past the limit, before unpacking it", async () => {
    // Ten megabytes of upload can hold gigabytes of zeros. Here the entry
    // only says so: what matters is that the declaration alone is enough.
    const buffer = await archive({ "word/document.xml": "x".repeat(1000) });
    buffer.writeUInt32LE(
      MAX_DOCX_UNCOMPRESSED_BYTES + 1,
      offsetOf(buffer, CENTRAL_DIRECTORY_ENTRY) + 24,
    );
    extractRawText.mockClear();

    await expect(extractDocxText(buffer)).rejects.toThrow(
      "resume-text-too-long",
    );
    expect(extractRawText).not.toHaveBeenCalled();
  });

  it("refuses more parts than a document has", async () => {
    const buffer = await archive({ "a.xml": "x" });
    buffer.writeUInt16LE(
      MAX_DOCX_ENTRIES + 1,
      offsetOf(buffer, END_OF_CENTRAL_DIRECTORY) + 10,
    );

    expect(() => declaredDocxSize(buffer)).toThrow("resume-text-too-long");
  });

  it("refuses sizes deferred to a Zip64 record", async () => {
    const buffer = await archive({ "a.xml": "x" });
    buffer.writeUInt32LE(
      0xffffffff,
      offsetOf(buffer, CENTRAL_DIRECTORY_ENTRY) + 24,
    );

    expect(() => declaredDocxSize(buffer)).toThrow("resume-text-too-long");
  });

  it.each([
    ["no directory at all", Buffer.from("not a zip, and longer than the record it lacks")],
    ["nothing", Buffer.alloc(0)],
  ])("calls %s unreadable rather than too long", (_label, buffer) => {
    expect(() => declaredDocxSize(buffer)).toThrow("resume-parse-failed");
  });

  it("refuses a directory that runs off the end of the file", async () => {
    const buffer = await archive({ "a.xml": "x" });
    // Two entries claimed, one present.
    buffer.writeUInt16LE(2, offsetOf(buffer, END_OF_CENTRAL_DIRECTORY) + 10);

    expect(() => declaredDocxSize(buffer)).toThrow("resume-parse-failed");
  });

  it("hands a document within the limits to the parser", async () => {
    const buffer = await archive({ "word/document.xml": "<w:document/>" });
    extractRawText.mockClear();

    await expect(extractDocxText(buffer)).resolves.toBe("text");
    expect(extractRawText).toHaveBeenCalledWith({ buffer });
  });
});
