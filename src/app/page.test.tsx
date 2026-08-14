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
});
