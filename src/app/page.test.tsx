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

  it("keeps severity monotonic in lightness so the order survives greyscale", async () => {
    const css = await readFile(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    function lightness(hex: string) {
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const [r, g, b] = [1, 3, 5].map((index) =>
        Number.parseInt(hex.slice(index, index + 2), 16),
      );
      return (
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      );
    }

    function token(name: string) {
      const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "u").exec(css);
      expect(match, `--${name} is not defined`).not.toBeNull();
      return match![1];
    }

    // The old set was scrambled — 重要 was the lightest of the three and 关键
    // the darkest, 1.21:1 apart — so severity was readable by hue alone.
    const order = ["sev-gate-ink", "sev-critical-ink", "sev-important-ink", "sev-minor-ink"];
    const values = order.map((name) => lightness(token(name)));
    for (let index = 1; index < values.length; index += 1) {
      expect(
        values[index],
        `${order[index]} must be lighter than ${order[index - 1]}`,
      ).toBeGreaterThan(values[index - 1]);
    }
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
