// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  applicationNextStep,
  mostPressingNextStep,
  nextStepHref,
} from "./next-step";
import type { Application } from "./schemas";

const id = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";

function application(
  overrides: Partial<Pick<Application, "id" | "stage" | "resumeSourceAssetId" | "updatedAt">> = {},
) {
  return {
    id,
    stage: "preparing" as Application["stage"],
    resumeSourceAssetId: assetId as string | null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("what an application needs next", () => {
  it("is a resume to compare with, when there is none", () => {
    expect(
      applicationNextStep(application({ resumeSourceAssetId: null }), false),
    ).toBe("choose-resume");
  });

  it("is the analysis, once there is a resume and no result", () => {
    expect(applicationNextStep(application(), false)).toBe("analyse");
  });

  it("is the guidance, once analysed and not yet sent", () => {
    expect(applicationNextStep(application(), true)).toBe("read-guidance");
  });

  it.each(["applied", "hr"] as const)(
    "is nothing once analysed and %s: the next move is the employer's",
    (stage) => {
      expect(applicationNextStep(application({ stage }), true)).toBeNull();
    },
  );

  it("is still a resume for an application sent without one", () => {
    expect(
      applicationNextStep(
        application({ stage: "applied", resumeSourceAssetId: null }),
        false,
      ),
    ).toBe("choose-resume");
  });

  it("is interview preparation at the interview stage, whatever else is missing", () => {
    expect(
      applicationNextStep(
        application({ stage: "interview", resumeSourceAssetId: null }),
        false,
      ),
    ).toBe("prepare-interview");
  });

  it.each(["offer", "rejected", "withdrawn"] as const)(
    "is nothing for an application that is %s",
    (stage) => {
      expect(
        applicationNextStep(
          application({ stage, resumeSourceAssetId: null }),
          false,
        ),
      ).toBeNull();
    },
  );

  it("leads to the tab where the step is taken", () => {
    expect(nextStepHref(id, "choose-resume")).toBe(`/applications/${id}?tab=resume`);
    expect(nextStepHref(id, "analyse")).toBe(`/applications/${id}?tab=difference`);
    expect(nextStepHref(id, "read-guidance")).toBe(`/applications/${id}?tab=improvements`);
    expect(nextStepHref(id, "prepare-interview")).toBe(`/applications/${id}?tab=interview`);
  });
});

describe("which application to put first", () => {
  it("is none when nothing is waiting on the owner", () => {
    expect(
      mostPressingNextStep(
        [application({ stage: "rejected" }), application({ id: "b", stage: "applied" })],
        new Set([id, "b"]),
      ),
    ).toBeNull();
    expect(mostPressingNextStep([], new Set())).toBeNull();
  });

  it("is the one with an interview, over one touched more recently", () => {
    const interviewing = application({
      id: "interviewing",
      stage: "interview",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const recent = application({
      id: "recent",
      resumeSourceAssetId: null,
      updatedAt: "2026-09-20T00:00:00.000Z",
    });

    expect(mostPressingNextStep([recent, interviewing], new Set())).toEqual({
      application: interviewing,
      step: "prepare-interview",
    });
  });

  it("is otherwise the one touched most recently", () => {
    const older = application({ id: "older", updatedAt: "2026-08-01T00:00:00.000Z" });
    const newer = application({
      id: "newer",
      resumeSourceAssetId: null,
      updatedAt: "2026-09-20T00:00:00.000Z",
    });

    expect(mostPressingNextStep([older, newer], new Set())).toEqual({
      application: newer,
      step: "choose-resume",
    });
  });

  it("knows which applications have been analysed", () => {
    expect(
      mostPressingNextStep([application()], new Set([id])),
    ).toMatchObject({ step: "read-guidance" });
    expect(mostPressingNextStep([application()], new Set())).toMatchObject({
      step: "analyse",
    });
  });
});
