import mammoth from "mammoth";

/**
 * What the archive says it holds once unpacked.
 *
 * A .docx is a zip, and the ten megabytes the upload allows can unpack to
 * gigabytes: mammoth inflates every entry into memory before it looks at any
 * of them. A resume unpacks to a few hundred kilobytes, more with a photo.
 */
export const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

/** A Word document has a few dozen parts. */
export const MAX_DOCX_ENTRIES = 2_000;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const ZIP64_MARKER = 0xffffffff;

/**
 * Adds up the sizes in the zip's central directory, without inflating
 * anything.
 *
 * These are the sizes the archive declares. One built to lie about them gets
 * past this, and is then stopped by the unzipper noticing the mismatch — but
 * only after it has inflated the entry that lied. Closing that would take an
 * inflater that counts as it goes, which mammoth does not expose. What this
 * does stop is every archive that is merely huge, honest bombs included.
 */
export function declaredDocxSize(buffer: Buffer) {
  // The record is at the end, before an optional comment of up to 64 KiB.
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);
  let end = -1;
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("resume-parse-failed");

  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  // Sizes that do not fit in 32 bits live in a Zip64 record. Nothing that is
  // a resume needs one.
  if (entries === 0xffff || offset === ZIP64_MARKER) {
    throw new Error("resume-text-too-long");
  }
  if (entries > MAX_DOCX_ENTRIES) throw new Error("resume-text-too-long");

  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY
    ) {
      throw new Error("resume-parse-failed");
    }
    const uncompressed = buffer.readUInt32LE(offset + 24);
    if (uncompressed === ZIP64_MARKER) throw new Error("resume-text-too-long");
    total += uncompressed;
    if (total > MAX_DOCX_UNCOMPRESSED_BYTES) {
      throw new Error("resume-text-too-long");
    }
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  return { entries, uncompressedBytes: total };
}

export async function extractDocxText(buffer: Buffer) {
  declaredDocxSize(buffer);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
