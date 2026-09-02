import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("public home", () => {
  it("introduces the workspace and links to account access", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /让每次申请都有依据/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "登录或注册" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("defines the approved V2 mint design tokens", async () => {
    const css = await readFile(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(css).toContain("--canvas: #fffaf2");
    expect(css).toContain("--mint: #bdebd7");
    expect(css).toContain("--cream: #fff2a8");
    expect(css).toContain("--coral: #ff796d");
    expect(css).toContain("--mist-blue: #c8ddff");
    expect(css).toContain("--ink: #293733");
  });

  it("never advertises a match score the product refuses to produce", async () => {
    // PRODUCT.md rules out match percentages, admission probability and overall
    // competence scores. A landing page that shows one sets an expectation the
    // product deliberately never meets, and does it with the number users are
    // most likely to remember.
    const source = await readFile(
      join(process.cwd(), "src/app/page.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/匹配\s*\d+\s*%/u);
    expect(source).not.toMatch(/完成度\s*\d+\s*%/u);
    expect(source).not.toMatch(/(?:匹配度|胜任|录取)[^\n]{0,12}%/u);
  });
});
