import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Application } from "./schemas";
import { ApplicationList, filterApplications } from "./application-list";

function application(
  overrides: Partial<Application> & Pick<Application, "id" | "stage">,
): Application {
  const base: Omit<Application, "id" | "stage"> = {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companyName: "Acme GmbH",
    roleTitle: "Product Manager",
    location: "Berlin",
    workplaceMode: "hybrid",
    source: "Company site",
    jobUrl: "https://example.com/jobs/1",
    jdText:
      "Lead product discovery, partner with engineering, and measure customer outcomes.",
    stageChangedAt: "2026-08-13T12:00:00.000Z",
    appliedAt: null,
    nextAction: null,
    nextActionDueAt: null,
    createdAt: "2026-08-13T10:00:00.000Z",
    updatedAt: "2026-08-13T12:00:00.000Z",
  };
  return {
    ...base,
    ...overrides,
  };
}

const applications = [
  application({ id: "app-1", stage: "preparing" }),
  application({
    id: "app-2",
    stage: "interview",
    companyName: "Northstar Labs",
    roleTitle: "Senior Product Analyst",
    location: "Amsterdam",
    source: "Referral",
  }),
];

describe("ApplicationList", () => {
  it("shows an actionable empty state", () => {
    render(<ApplicationList applications={[]} view="board" />);

    expect(screen.getByRole("heading", { name: "还没有投递记录" })).toBeVisible();
    expect(screen.getByRole("link", { name: "新建第一份申请" })).toHaveAttribute(
      "href",
      "/applications/new",
    );
  });

  it("groups board cards under visible text stage labels", () => {
    render(<ApplicationList applications={applications} view="board" />);

    expect(screen.getByRole("heading", { name: "准备中" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "面试" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "已拒绝" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Acme GmbH/ })).toHaveAttribute(
      "href",
      "/applications/app-1",
    );
  });

  it("renders an information-dense table with stage text", () => {
    render(<ApplicationList applications={applications} view="table" />);

    for (const heading of ["公司与职位", "地点", "阶段", "来源", "最后更新"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeVisible();
    }
    expect(screen.getByRole("cell", { name: "面试" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Northstar Labs/ })).toHaveAttribute(
      "href",
      "/applications/app-2",
    );
  });

  it("filters by company, role, location, source, and stage", () => {
    expect(filterApplications(applications, { view: "board", q: "northstar" })).toEqual([
      applications[1],
    ]);
    expect(filterApplications(applications, { view: "board", q: "referral" })).toEqual([
      applications[1],
    ]);
    expect(
      filterApplications(applications, {
        view: "board",
        q: "",
        stage: "preparing",
      }),
    ).toEqual([applications[0]]);
  });
});
