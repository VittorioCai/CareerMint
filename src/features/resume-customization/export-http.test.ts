// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResumeVersion } from "./schemas";
import { createResumeExportGetHandler } from "./export-http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const version: ResumeVersion = {
  id: versionId,
  applicationId,
  userId,
  sourceRunId: "33333333-3333-4333-8333-333333333333",
  versionNumber: 2,
  template: "modern",
  createdAt: "2026-08-14T12:00:00.000Z",
  items: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      section: "achievement",
      content: "Improved checkout conversion by 18%.",
      reason: "Matches the role.",
      sortOrder: 0,
      evidence: [],
    },
  ],
};

function dependencies() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({
      id: userId,
      email: "jordan@example.com",
    }),
    getApplication: vi.fn().mockResolvedValue({
      id: applicationId,
      userId,
      companyName: "North Star / Labs",
      roleTitle: "Senior Product Manager",
    }),
    getVersion: vi.fn().mockResolvedValue(version),
    getProfile: vi.fn().mockResolvedValue({ displayName: "Jordan Lee" }),
    buildDocx: vi.fn().mockResolvedValue(Uint8Array.from([80, 75, 3, 4])),
    buildPdf: vi
      .fn()
      .mockResolvedValue(Uint8Array.from([37, 80, 68, 70, 45])),
  };
}

function context(
  id = applicationId,
  requestedVersionId = versionId,
) {
  return { params: Promise.resolve({ id, versionId: requestedVersionId }) };
}

describe("resume document export GET handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated, invalid, and unowned resources before generation", async () => {
    const fakes = dependencies();
    const get = createResumeExportGetHandler(fakes);
    fakes.getCurrentUser.mockResolvedValue(null);
    expect(
      (await get(new Request("http://test?format=docx"), context())).status,
    ).toBe(401);
    expect(fakes.getApplication).not.toHaveBeenCalled();

    fakes.getCurrentUser.mockResolvedValue({ id: userId });
    expect(
      (await get(new Request("http://test?format=docx"), context("nope")))
        .status,
    ).toBe(404);

    fakes.getApplication.mockResolvedValue(null);
    expect(
      (await get(new Request("http://test?format=docx"), context())).status,
    ).toBe(404);
    expect(fakes.buildDocx).not.toHaveBeenCalled();
  });

  it("exports only the requested immutable version as a private DOCX download", async () => {
    const fakes = dependencies();
    const get = createResumeExportGetHandler(fakes);

    const response = await get(
      new Request("http://test?format=docx"),
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="north-star-labs-senior-product-manager-v2.docx"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fakes.getVersion).toHaveBeenCalledWith(
      userId,
      applicationId,
      versionId,
    );
    expect(fakes.buildDocx).toHaveBeenCalledWith({
      candidateName: "Jordan Lee",
      email: "jordan@example.com",
      companyName: "North Star / Labs",
      roleTitle: "Senior Product Manager",
      versionNumber: 2,
      template: "modern",
      items: [{ section: "achievement", content: version.items[0].content }],
    });
    expect(fakes.buildPdf).not.toHaveBeenCalled();
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      80, 75, 3, 4,
    ]);
  });

  it("exports PDF and falls back to the email name when the profile is absent", async () => {
    const fakes = dependencies();
    fakes.getProfile.mockResolvedValue(null);
    const get = createResumeExportGetHandler(fakes);

    const response = await get(
      new Request("http://test?format=pdf"),
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(fakes.buildPdf).toHaveBeenCalledWith(
      expect.objectContaining({ candidateName: "jordan" }),
    );
  });

  it("returns stable errors for unsupported formats and PDF characters", async () => {
    const fakes = dependencies();
    const get = createResumeExportGetHandler(fakes);
    const invalid = await get(
      new Request("http://test?format=pages"),
      context(),
    );
    expect(invalid.status).toBe(400);
    expect(fakes.getApplication).not.toHaveBeenCalled();

    fakes.buildPdf.mockRejectedValue(new Error("pdf-unsupported-characters"));
    const unsupported = await get(
      new Request("http://test?format=pdf"),
      context(),
    );
    expect(unsupported.status).toBe(400);
    await expect(unsupported.json()).resolves.toEqual({
      error: "pdf-unsupported-characters",
      fallback: "docx",
    });
  });

  it("does not expose private resume content when generation fails", async () => {
    const fakes = dependencies();
    fakes.buildDocx.mockRejectedValue(
      new Error(`failed: ${version.items[0].content}`),
    );
    const get = createResumeExportGetHandler(fakes);
    const response = await get(
      new Request("http://test?format=docx"),
      context(),
    );
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("resume-export-failed");
    expect(body).not.toContain(version.items[0].content);
  });
});
