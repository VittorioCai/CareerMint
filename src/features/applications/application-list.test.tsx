import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Application } from "./schemas";
import {
  ApplicationList,
  filterApplications,
  stageAgeLabel,
} from "./application-list";
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

// Nine days after every fixture entered its stage.
const now = new Date("2026-08-22T12:00:00.000Z");

describe("ApplicationList", () => {
  it("shows an actionable empty state", () => {
    render(<ApplicationList copy={zhCN.applications} locale="zh-CN" applications={[]} view="board" now={now} />);

    expect(screen.getByRole("heading", { name: "还没有投递记录" })).toBeVisible();
    expect(screen.getByRole("link", { name: "新建第一份申请" })).toHaveAttribute(
      "href",
      "/applications/new",
    );
  });

  it("groups board cards under visible text stage labels", () => {
    render(<ApplicationList copy={zhCN.applications} locale="zh-CN" applications={applications} view="board" now={now} />);

    expect(screen.getByRole("heading", { name: "准备中" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "面试" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "已拒绝" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Acme GmbH/ })).toHaveAttribute(
      "href",
      "/applications/app-1",
    );
  });

  it("offers a way in, and nothing that destroys, on each card", () => {
    render(<ApplicationList copy={zhCN.applications} locale="zh-CN" applications={applications} view="board" now={now} />);

    // Deleting lives on the application's own page. The card it used to sit
    // on had no other visible action, so the one thing a card appeared to
    // offer was its own removal.
    expect(screen.queryByRole("button", { name: "删除记录" })).toBeNull();
    const card = screen.getByRole("link", { name: /Acme GmbH/ });
    expect(card).toHaveTextContent("打开工作区");
    expect(card).toHaveTextContent("在此阶段 9 天");
  });

  it("shows the next step on a card that has one", () => {
    render(
      <ApplicationList
        copy={zhCN.applications}
        locale="zh-CN"
        applications={[
          application({
            id: "app-3",
            stage: "applied",
            nextAction: "Send the portfolio link",
          }),
        ]}
        view="board"
        now={now}
      />,
    );

    expect(screen.getByRole("link", { name: /Acme GmbH/ })).toHaveTextContent(
      "下一步：Send the portfolio link",
    );
  });

  it("gives an empty stage its heading and not its width", () => {
    render(<ApplicationList copy={zhCN.applications} locale="zh-CN" applications={applications} view="board" now={now} />);

    const grid = screen.getByTestId("application-board").firstElementChild as HTMLElement;
    // preparing and interview hold a card each; the other five are narrow.
    expect(grid.style.getPropertyValue("--board-columns")).toBe(
      [
        "15rem",
        "6rem",
        "6rem",
        "15rem",
        "6rem",
        "6rem",
        "6rem",
      ].join(" "),
    );
  });

  it("leaves empty stages quiet instead of repeating a placeholder", () => {
    // Seven stages and two records meant five dashed "暂无记录" boxes, which is
    // five pieces of furniture saying nothing. The stage heading already
    // carries a count.
    render(<ApplicationList copy={zhCN.applications} locale="zh-CN" applications={applications} view="board" now={now} />);

    expect(screen.queryAllByText("暂无记录")).toHaveLength(0);
  });

  it("renders an information-dense table with stage text", () => {
    render(<ApplicationList copy={zhCN.applications} locale="zh-CN" applications={applications} view="table" now={now} />);

    // Scoped to the table, because a phone gets the same records as cards and
    // a global query cannot tell the two apart. Only one is ever displayed:
    // each carries the media-query class that hides it at the other width.
    const table = within(screen.getByTestId("application-table"));
    for (const heading of ["公司与职位", "地点", "阶段", "来源", "最后更新", "操作"]) {
      expect(table.getByRole("columnheader", { name: heading })).toBeVisible();
    }
    // The stage, and under it how long the application has been there.
    expect(table.getByRole("cell", { name: /^面试/u })).toBeVisible();
    expect(
      table.getByRole("link", {
        name: "Northstar Labs · Senior Product Analyst",
      }),
    ).toHaveAttribute("href", "/applications/app-2");
    expect(table.queryByRole("button", { name: "删除记录" })).toBeNull();
    expect(
      table.getByRole("link", {
        name: "打开工作区: Northstar Labs · Senior Product Analyst",
      }),
    ).toHaveAttribute("href", "/applications/app-2");
    expect(table.getAllByText("在此阶段 9 天")).toHaveLength(2);
  });

  it("counts whole days in a stage, and says so plainly on the first", () => {
    const copy = zhCN.applications;
    const entered = "2026-08-13T12:00:00.000Z";
    expect(stageAgeLabel(entered, new Date("2026-08-13T20:00:00.000Z"), copy)).toBe("今天进入此阶段");
    expect(stageAgeLabel(entered, new Date("2026-08-14T12:00:00.000Z"), copy)).toBe("在此阶段 1 天");
    expect(stageAgeLabel(entered, new Date("2026-08-22T12:00:00.000Z"), copy)).toBe("在此阶段 9 天");
    // A clock that disagrees with the server by a minute is not a negative age.
    expect(stageAgeLabel(entered, new Date("2026-08-13T11:59:00.000Z"), copy)).toBe("今天进入此阶段");
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
       
        locale="zh-CN"
        applications={[application({ id: "a", stage: "applied" })]}
        view="table"
        now={now}
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
       
        locale="zh-CN"
        applications={[application({ id: "a", stage: "applied" })]}
        view="board"
        now={now}
      />,
    );

    // The board already renders cards, so it needs no phone copy: the seven
    // columns stack below `md`, which keeps the stage grouping and drops the
    // sideways swipe. One card in the DOM, not two.
    expect(screen.queryByTestId("application-cards")).toBeNull();
    expect(screen.getAllByRole("link", { name: /Acme GmbH/u })).toHaveLength(1);

    const board = screen.getByTestId("application-board");
    expect(board).not.toHaveClass("overflow-x-auto");
    // Unprefixed: a `md:` variant of a component class generates nothing, and
    // the board went without any cue at its edge for as long as it had one.
    // `.scroll-x-fade` scopes itself to the widths where the board scrolls.
    expect(board).toHaveClass("scroll-x-fade", "snap-columns");
  });

  it("hides the empty stage columns a phone has no room for", () => {
    render(
      <ApplicationList
        copy={zhCN.applications}
       
        locale="zh-CN"
        applications={[application({ id: "a", stage: "applied" })]}
        view="board"
        now={now}
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
