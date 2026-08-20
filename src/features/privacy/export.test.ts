// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import { buildAccountExport } from "./export";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("buildAccountExport", () => {
  it("exports only owned profile data and files without internal paths", async () => {
    const dependencies = {
      getProfile: vi.fn().mockResolvedValue({
        userId,
        displayName: "Lin Chen",
        createdAt: "2026-08-14T00:00:00.000Z",
      }),
      listFacts: vi.fn().mockResolvedValue([
        {
          id: "22222222-2222-4222-8222-222222222222",
          userId,
          data: { title: "SQL" },
          createdAt: "2026-08-14T00:00:00.000Z",
        },
        {
          id: "99999999-9999-4999-8999-999999999999",
          userId: otherUserId,
          data: { title: "Other user secret" },
        },
      ]),
      listAssets: vi.fn().mockResolvedValue([
        {
          id: "11111111-1111-4111-8111-111111111111",
          userId,
          originalName: "../resume.pdf",
          contentType: "application/pdf",
          storagePath: `${userId}/asset/source.pdf`,
          sizeBytes: 12,
          sha256: "a".repeat(64),
          status: "ready",
          createdAt: "2026-08-14T00:00:00.000Z",
        },
        {
          id: "88888888-8888-4888-8888-888888888888",
          userId: otherUserId,
          originalName: "other.pdf",
          storagePath: `${otherUserId}/asset/source.pdf`,
        },
      ]),
      listApplications: vi.fn().mockResolvedValue([
        {
          id: "33333333-3333-4333-8333-333333333333",
          userId,
          companyName: "Acme GmbH",
          roleTitle: "Product Manager",
          jdText: "Private owned JD text",
        },
        {
          id: "77777777-7777-4777-8777-777777777777",
          userId: otherUserId,
          companyName: "Other Company",
          roleTitle: "Secret",
          jdText: "Other user private JD",
        },
      ]),
      listApplicationEvents: vi.fn().mockResolvedValue([
        {
          id: "44444444-4444-4444-8444-444444444444",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          toStage: "applied",
        },
      ]),
      listAnalysisRuns: vi.fn().mockResolvedValue([
        {
          id: "55555555-5555-4555-8555-555555555555",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          status: "succeeded",
        },
      ]),
      listRequirements: vi.fn().mockResolvedValue([
        {
          id: "66666666-6666-4666-8666-666666666666",
          applicationId: "33333333-3333-4333-8333-333333333333",
          text: "Advanced SQL",
          evidence: [],
        },
      ]),
      listResumeRuns: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-1111-4111-8111-111111111111",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          status: "succeeded",
        },
      ]),
      listResumeSuggestions: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-2222-4222-8222-222222222222",
          applicationId: "33333333-3333-4333-8333-333333333333",
          content: "Improved checkout conversion by 18%.",
          facts: [],
          requirements: [],
        },
      ]),
      listResumeVersions: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-3333-4333-8333-333333333333",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          versionNumber: 1,
          items: [
            {
              content: "Improved checkout conversion by 18%.",
              evidence: [],
            },
          ],
        },
      ]),
      listInterviewQuestions: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-4444-4444-8444-444444444444",
          userId,
          prompt: "Tell me about yourself.",
          answerOutline: "Present, past, and why this role.",
          applicationLinks: [],
          facts: [],
        },
        {
          id: "aaaaaaaa-5555-4555-8555-555555555555",
          userId: otherUserId,
          prompt: "Other user interview secret",
          applicationLinks: [],
          facts: [],
        },
      ]),
      download: vi.fn().mockResolvedValue(new Blob(["synthetic pdf"])),
    };

    const buffer = await buildAccountExport(userId, dependencies);
    const zip = await JSZip.loadAsync(buffer);

    expect(Object.keys(zip.files).sort()).toEqual([
      "files/",
      "files/11111111-1111-4111-8111-111111111111/",
      "files/11111111-1111-4111-8111-111111111111/resume.pdf",
      "application-workspaces.json",
      "interview-preparation.json",
      "profile.json",
      "source-assets.json",
    ].sort());
    const profileJson = await zip.file("profile.json")!.async("string");
    const assetsJson = await zip.file("source-assets.json")!.async("string");
    const applicationsJson = await zip
      .file("application-workspaces.json")!
      .async("string");
    const interviewJson = await zip
      .file("interview-preparation.json")!
      .async("string");
    expect(profileJson).toContain("Lin Chen");
    expect(profileJson).toContain("SQL");
    expect(profileJson).not.toContain("Other user secret");
    expect(assetsJson).not.toContain("storagePath");
    expect(assetsJson).not.toContain("storage_path");
    expect(assetsJson).not.toContain(`${userId}/asset/source.pdf`);
    expect(JSON.stringify(Object.keys(zip.files))).not.toContain(otherUserId);
    expect(applicationsJson).toContain("Acme GmbH");
    expect(applicationsJson).toContain("Private owned JD text");
    expect(applicationsJson).toContain("Advanced SQL");
    expect(applicationsJson).toContain("resumeRuns");
    expect(applicationsJson).toContain("resumeSuggestions");
    expect(applicationsJson).toContain("resumeVersions");
    expect(applicationsJson).toContain("Improved checkout conversion by 18%.");
    expect(applicationsJson).not.toContain("Other user private JD");
    expect(interviewJson).toContain("Tell me about yourself.");
    expect(interviewJson).toContain("Present, past, and why this role.");
    expect(interviewJson).not.toContain("Other user interview secret");
    expect(dependencies.download).toHaveBeenCalledExactlyOnceWith(
      `${userId}/asset/source.pdf`,
    );
  });
});
