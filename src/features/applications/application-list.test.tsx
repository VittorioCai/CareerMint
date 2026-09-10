import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import type { Application } from "./schemas";
import { ApplicationList, filterApplications } from "./application-list";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

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
    render(<ApplicationList copy={zhCN.applications} common={zhCN.common} locale="zh-CN" applications={[]} view="board" deleteApplication={deleteApplication} />);

    expect(screen.getByRole("heading", { name: "还没有投递记录" })).toBeVisible();
    expect(screen.getByRole("link", { name: "新建第一份申请" })).toHaveAttribute(
      "href",
      "/applications/new",
    );
  });

  it("groups board cards under visible text stage labels", () => {
    render(<ApplicationList copy={zhCN.applications} common={zhCN.common} locale="zh-CN" applications={applications} view="board" deleteApplication={deleteApplication} />);

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

  it("leaves empty stages quiet instead of repeating a placeholder", () => {
    // Seven stages and two records meant five dashed "暂无记录" boxes, which is
    // five pieces of furniture saying nothing. The stage heading already
    // carries a count.
    render(<ApplicationList copy={zhCN.applications} common={zhCN.common} locale="zh-CN" applications={applications} view="board" deleteApplication={deleteApplication} />);

    expect(screen.queryAllByText("暂无记录")).toHaveLength(0);
  });

  it("renders an information-dense table with stage text", () => {
    render(<ApplicationList copy={zhCN.applications} common={zhCN.common} locale="zh-CN" applications={applications} view="table" deleteApplication={deleteApplication} />);

    // Scoped to the table, because a phone gets the same records as cards and
    // a global query cannot tell the two apart. Only one is ever displayed:
    // each carries the media-query class that hides it at the other width.
    const table = within(screen.getByTestId("application-table"));
    for (const heading of ["公司与职位", "地点", "阶段", "来源", "最后更新", "操作"]) {
      expect(table.getByRole("columnheader", { name: heading })).toBeVisible();
    }
    expect(table.getByRole("cell", { name: "面试" })).toBeVisible();
    expect(table.getByRole("link", { name: /Northstar Labs/u })).toHaveAttribute(
      "href",
      "/applications/app-2",
    );
    expect(table.getAllByRole("button", { name: "删除记录" })).toHaveLength(2);
  });

  it("expands the selected record warning without opening the detail link", async () => {
    const user = userEvent.setup();
    render(<ApplicationList copy={zhCN.applications} common={zhCN.common} locale="zh-CN" applications={applications} view="board" deleteApplication={deleteApplication} />);

    await user.click(screen.getAllByRole("button", { name: "删除记录" })[0]);
    expect(screen.getByRole("alert")).toHaveTextContent("Acme GmbH · Product Manager");
    // The board renders one copy of each card, so this count is not two.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
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

describe("ApplicationList on a phone", () => {
  it("stacks records as cards instead of a table that scrolls sideways", () => {
    render(
      <ApplicationList
        copy={zhCN.applications}
        common={zhCN.common}
        locale="zh-CN"
        applications={[application({ id: "a", stage: "applied" })]}
        view="table"
        deleteApplication={vi.fn()}
      />,
    );

    // Both are rendered; CSS decides which the viewport gets. What matters is
    // that a phone is never left with only an 820px table: on 390px of screen
    // that is two of six columns, and the rest is a sideways swipe.
    const phone = screen.getByTestId("application-cards");
    expect(phone).toHaveClass("md:hidden");
    expect(within(phone).getByText("Acme GmbH")).toBeVisible();

    const wide = screen.getByTestId("application-table");
    expect(wide).toHaveClass("max-md:hidden");
  });

  it("stacks the board's columns rather than duplicating its cards", () => {
    render(
      <ApplicationList
        copy={zhCN.applications}
        common={zhCN.common}
        locale="zh-CN"
        applications={[application({ id: "a", stage: "applied" })]}
        view="board"
        deleteApplication={vi.fn()}
      />,
    );

    // The board already renders cards, so it needs no phone copy: the seven
    // columns stack below `md`, which keeps the stage grouping and drops the
    // sideways swipe. One card in the DOM, not two.
    expect(screen.queryByTestId("application-cards")).toBeNull();
    expect(screen.getAllByRole("link", { name: /Acme GmbH/u })).toHaveLength(1);

    const board = screen.getByTestId("application-board");
    expect(board).not.toHaveClass("overflow-x-auto");
    expect(board).toHaveClass("md:overflow-x-auto");
  });

  it("hides the empty stage columns a phone has no room for", () => {
    render(
      <ApplicationList
        copy={zhCN.applications}
        common={zhCN.common}
        locale="zh-CN"
        applications={[application({ id: "a", stage: "applied" })]}
        view="board"
        deleteApplication={vi.fn()}
      />,
    );

    // An empty column shows the shape of the pipeline on a wide board. Stacked
    // on a phone it is a heading and a zero, six times over.
    const empty = screen
      .getByRole("heading", { name: "准备中", level: 2 })
      .closest("section");
    expect(empty).toHaveClass("max-md:hidden");
    expect(
      screen.getByRole("heading", { name: "已投递", level: 2 }).closest("section"),
    ).not.toHaveClass("max-md:hidden");
  });
});
