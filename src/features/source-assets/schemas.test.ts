// @vitest-environment node

import { describe, expect, it } from "vitest";

import { validateResumeFile } from "./schemas";

describe("validateResumeFile", () => {
  it("rejects renamed executable content", async () => {
    const file = new File(
      [new Uint8Array([0x4d, 0x5a, 0x90, 0x00])],
      "resume.pdf",
      { type: "application/pdf" },
    );

    await expect(validateResumeFile(file)).rejects.toThrow(
      "unsupported-file-signature",
    );
  });

  it("rejects files over 10 MiB", async () => {
    const file = new File(
      [new Uint8Array(10 * 1024 * 1024 + 1)],
      "resume.pdf",
      { type: "application/pdf" },
    );

    await expect(validateResumeFile(file)).rejects.toThrow("file-too-large");
  });
});
