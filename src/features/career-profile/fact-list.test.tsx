import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// FactList reaches for the server actions itself, and those pull in
// `server-only`. The list's own job — which categories exist — does not touch
// them, so a stub is enough to get the component into a jsdom render.
vi.mock("./actions", () => ({
  confirmFactAction: vi.fn(),
  createFactAction: vi.fn(),
  deleteFactAction: vi.fn(),
  markNeedsDetailAction: vi.fn(),
  updateFactAction: vi.fn(),
}));

import { FactList } from "./fact-list";
import type { CareerFact } from "./schemas";

function fact(index: number, overrides: Partial<CareerFact> = {}): CareerFact {
  return {
    id: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
    userId: "33333333-3333-4333-8333-333333333333",
    sourceAssetId: null,
    factType: "work_experience",
    data: {
      title: `跨部门业务复盘 ${index}`,
      organization: "Northstar GmbH",
      startDate: "2024-01",
      endDate: "2025-06",
      description: "每季度与销售和运营复盘转化数据。",
      skills: ["SQL"],
    },
    sourceExcerpt: null,
    confirmationStatus: "confirmed",
    confirmedAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

describe("FactList", () => {
  it("only shows the categories that have something in them", () => {
    render(<FactList facts={[fact(1)]} />);

    expect(
      screen.getByRole("heading", { name: "工作经历", level: 2 }),
    ).toBeVisible();
    // Nine categories exist. One fact used to render the other eight as empty
    // boxes each saying 暂时没有这类事实 — eight placeholders shown as content,
    // on a page whose own empty state promises 分类会在有内容之后出现.
    for (const absent of ["教育", "项目", "技能", "证书", "语言"]) {
      expect(
        screen.queryByRole("heading", { name: absent, level: 2 }),
      ).toBeNull();
    }
    expect(screen.queryByText("暂时没有这类事实。")).toBeNull();
  });

  it("hides the index until there is somewhere to jump to", () => {
    render(<FactList facts={[fact(1)]} />);

    // A table of contents with one entry is not a table of contents; it is a
    // second copy of the heading below it.
    expect(screen.queryByRole("navigation", { name: "档案分类" })).toBeNull();
  });

  it("indexes every category that has facts, and no others", () => {
    render(
      <FactList
        facts={[
          fact(1),
          fact(2, { factType: "education" }),
          fact(3, { factType: "skill" }),
        ]}
      />,
    );

    const index = screen.getByRole("navigation", { name: "档案分类" });
    const links = within(index).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "工作经历",
      "教育",
      "技能",
    ]);
    expect(links[0]).toHaveAttribute("href", "#facts-work_experience");
  });

  it("keeps the empty state as one path rather than a wall of headings", () => {
    render(<FactList facts={[]} />);

    expect(screen.getByText("还没有职业事实")).toBeVisible();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });
});
