// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { applicationRepository } from "./repository";

const applicationId = "11111111-1111-4111-8111-111111111111";
const sourceAssetId = "22222222-2222-4222-8222-222222222222";

function applicationRow() {
  return {
    id: applicationId,
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    company_name: "Acme GmbH",
    role_title: "Product Manager",
    location: "Berlin",
    workplace_mode: "hybrid",
    source: "Company site",
    job_url: "https://example.com/jobs/1",
    jd_text:
      "Lead product discovery, partner with engineering, and measure customer outcomes.",
    stage: "preparing",
    stage_changed_at: "2026-08-13T12:00:00.000Z",
    applied_at: null,
    next_action: null,
    next_action_due_at: null,
    resume_source_asset_id: sourceAssetId,
    created_at: "2026-08-13T10:00:00.000Z",
    updated_at: "2026-08-13T12:00:00.000Z",
  };
}

describe("application repository baseline resume selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Deliberately expose only rpc: any direct applications table update path
    // would fail instead of being silently accepted by this boundary test.
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("sets a non-null baseline through the typed RPC and hydrates the row", async () => {
    mocks.rpc.mockResolvedValue({ data: applicationRow(), error: null });

    await expect(
      applicationRepository.setResumeSource({ applicationId, sourceAssetId }),
    ).resolves.toMatchObject({
      id: applicationId,
      resumeSourceAssetId: sourceAssetId,
    });

    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "set_application_resume_source",
      {
        target_application_id: applicationId,
        target_source_asset_id: sourceAssetId,
      },
    );
  });

  it("omits the optional RPC source argument when clearing the baseline", async () => {
    mocks.rpc.mockResolvedValue({ data: applicationRow(), error: null });

    await expect(
      applicationRepository.setResumeSource({
        applicationId,
        sourceAssetId: null,
      }),
    ).resolves.toMatchObject({ id: applicationId });

    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "set_application_resume_source",
      { target_application_id: applicationId },
    );
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty(
      "target_source_asset_id",
    );
  });

  it.each([
    ["P0002", "application-or-resume-not-found"],
    ["PGRST116", "application-or-resume-not-found"],
    ["22023", "invalid-application-input"],
    ["23514", "invalid-application-input"],
    ["XX000", "application-storage-error"],
  ])("maps RPC error %s to %s", async (code, expectedCode) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code } });

    await expect(
      applicationRepository.setResumeSource({ applicationId, sourceAssetId }),
    ).rejects.toMatchObject({ code: expectedCode });
  });
});
