import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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
    resumeSourceAssetId: null,
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

const deleteApplication = vi.fn(async () => ({
  ok: true as const,
  applicationId: "app-1",
}));

describe("ApplicationList", () => {
  it("shows an actionable empty state", () => {
    render(<ApplicationList applications={[]} view="board" deleteApplication={deleteApplication} />);

    expect(screen.getByRole("heading", { name: "还没有投递记录" })).toBeVisible();
    expect(screen.getByRole("link", { name: "新建第一份申请" })).toHaveAttribute(
      "href",
      "/applications/new",
    );
  });

  it("groups board cards under visible text stage labels", () => {
    render(<ApplicationList applications={applications} view="board" deleteApplication={deleteApplication} />);

    expect(screen.getByRole("heading", { name: "准备中" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "面试" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "已拒绝" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Acme GmbH/ })).toHaveAttribute(
      "href",
      "/applications/app-1",
    );
    expect(screen.getAllByRole("button", { name: "删除记录" })).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "删除记录" })[0]?.closest("a"),
    ).toBeNull();
  });

  it("renders an information-dense table with stage text", () => {
    render(<ApplicationList applications={applications} view="table" deleteApplication={deleteApplication} />);

    for (const heading of ["公司与职位", "地点", "阶段", "来源", "最后更新", "操作"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeVisible();
    }
    expect(screen.getByRole("cell", { name: "面试" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Northstar Labs/ })).toHaveAttribute(
      "href",
      "/applications/app-2",
    );
    expect(screen.getAllByRole("button", { name: "删除记录" })).toHaveLength(2);
  });

  it("expands the selected record warning without opening the detail link", async () => {
    const user = userEvent.setup();
    render(<ApplicationList applications={applications} view="board" deleteApplication={deleteApplication} />);

    await user.click(screen.getAllByRole("button", { name: "删除记录" })[0]);
    expect(screen.getByRole("alert")).toHaveTextContent("Acme GmbH · Product Manager");
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
