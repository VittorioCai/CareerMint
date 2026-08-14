import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  repository: {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    listEvents: vi.fn(),
    changeStage: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("./repository", () => ({
  applicationRepository: mocks.repository,
}));

import {
  changeApplicationStageAction,
  createApplicationAction,
} from "./actions";

function validApplicationFormData() {
  const formData = new FormData();
  formData.set("companyName", "Acme GmbH");
  formData.set("roleTitle", "Product Manager");
  formData.set("location", "Berlin");
  formData.set("workplaceMode", "hybrid");
  formData.set("source", "Company site");
  formData.set("jobUrl", "https://example.com/jobs/1");
  formData.set(
    "jdText",
    "Lead product discovery, partner with engineering, and measure customer outcomes.",
  );
  return formData;
}

describe("application actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "owner@example.com",
    });
    mocks.repository.create.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    mocks.repository.changeStage.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      stage: "applied",
    });
  });

  it("creates an application from validated fields without accepting a user id", async () => {
    const formData = validApplicationFormData();
    formData.set("userId", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

    await expect(createApplicationAction({}, formData)).resolves.toEqual({
      ok: true,
      applicationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.repository.create).toHaveBeenCalledExactlyOnceWith({
      companyName: "Acme GmbH",
      roleTitle: "Product Manager",
      location: "Berlin",
      workplaceMode: "hybrid",
      source: "Company site",
      jobUrl: "https://example.com/jobs/1",
      jdText:
        "Lead product discovery, partner with engineering, and measure customer outcomes.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/applications");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app");
  });

  it("does not call storage when application fields are invalid", async () => {
    const formData = validApplicationFormData();
    formData.set("jobUrl", "javascript:alert(1)");
    formData.set("jdText", "short");

    const result = await createApplicationAction({}, formData);

    expect(result).toMatchObject({ ok: false, error: "invalid-input" });
    expect(result).toHaveProperty("fieldErrors.jobUrl");
    expect(result).toHaveProperty("fieldErrors.jdText");
    expect(mocks.repository.create).not.toHaveBeenCalled();
  });

  it("changes stage with an occurrence date and revalidates owned views", async () => {
    const formData = new FormData();
    formData.set("applicationId", "11111111-1111-4111-8111-111111111111");
    formData.set("stage", "applied");
    formData.set("occurredOn", "2026-08-13");
    formData.set("note", "Submitted on the company site");

    await expect(changeApplicationStageAction({}, formData)).resolves.toEqual({
      ok: true,
      applicationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(mocks.repository.changeStage).toHaveBeenCalledExactlyOnceWith({
      applicationId: "11111111-1111-4111-8111-111111111111",
      stage: "applied",
      occurredAt: "2026-08-13T12:00:00.000Z",
      note: "Submitted on the company site",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/applications");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/applications/11111111-1111-4111-8111-111111111111",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app");
  });
});
