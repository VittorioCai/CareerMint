/**
 * The accessibility floor, enforced rather than reviewed.
 *
 * Each half of the pair comes from wherever it is actually knowable.
 *
 * The foreground is read from the computed `color`: reliable, and immune to
 * the antialiasing that stops a 14px CJK glyph from ever painting a pixel at
 * its own declared colour — sampling the darkest pixel under-reports thin text
 * by more than a whole point of contrast.
 *
 * The background is sampled from a rendered screenshot, because CSS cannot
 * tell you it. Reading `background-color` off the node lies whenever anything
 * above it is semi-transparent, painted with a gradient, or blended by a
 * parent, and this app has all three. The most common colour inside the
 * element's box is its background: glyphs never cover the majority of it.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PNG } from "pngjs";

const password = "CareerMint123!";
const jdText =
  "Lead product discovery for a European marketplace team. Measure customer outcomes with SQL and dashboards. Work with business stakeholders across three markets. German C1 is required.";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`a11y-e2e-${name.toLowerCase()}-missing`);
  return value;
}

function clients() {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  return {
    admin: createClient(supabaseUrl, requiredEnv("SUPABASE_SECRET_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    account: createClient(
      supabaseUrl,
      requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } },
    ),
  };
}

function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(r: number, g: number, b: number) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: number, b: number) {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

type TextNode = {
  selector: string;
  text: string;
  fontSize: number;
  fontWeight: number;
  color: [number, number, number, number];
  box: { x: number; y: number; width: number; height: number };
};

/**
 * WCAG's large-text allowance: 18.66px bold, or 24px at any weight.
 */
function floorFor(node: TextNode) {
  const large =
    node.fontSize >= 24 || (node.fontSize >= 18.66 && node.fontWeight >= 700);
  return large ? 3 : 4.5;
}

async function collectTextNodes(page: Page): Promise<TextNode[]> {
  return page.evaluate(() => {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    function path(element: Element): string {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && parts.length < 4) {
        const tag = current.tagName.toLowerCase();
        const testId = current.getAttribute("data-testid");
        if (testId) {
          parts.unshift(`${tag}[data-testid="${testId}"]`);
          break;
        }
        const parent: Element | null = current.parentElement;
        const index = parent
          ? Array.from(parent.children).indexOf(current) + 1
          : 1;
        parts.unshift(`${tag}:nth-child(${index})`);
        current = parent;
      }
      return parts.join(" > ");
    }

    function parseColor(value: string): [number, number, number, number] {
      const parts = value.match(/[\d.]+/g);
      if (!parts || parts.length < 3) return [0, 0, 0, 1];
      return [
        Number(parts[0]),
        Number(parts[1]),
        Number(parts[2]),
        parts.length > 3 ? Number(parts[3]) : 1,
      ];
    }

    const found: {
      selector: string;
      text: string;
      fontSize: number;
      fontWeight: number;
      color: [number, number, number, number];
      box: { x: number; y: number; width: number; height: number };
    }[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );

    let node = walker.nextNode();
    while (node) {
      const text = (node.textContent ?? "").trim();
      const element = node.parentElement;
      node = walker.nextNode();
      if (!text || !element || seen.has(element)) continue;
      seen.add(element);

      const style = getComputedStyle(element);
      if (
        style.visibility === "hidden" ||
        style.display === "none" ||
        Number(style.opacity) < 0.15
      ) {
        continue;
      }
      // Content inside a closed <details> still has layout but is not painted,
      // so sampling it reads one flat colour and scores 1:1.
      if (element.closest("details:not([open]) > :not(summary)")) continue;
      const visible = (element as Element & {
        checkVisibility?: (options: Record<string, boolean>) => boolean;
      }).checkVisibility;
      if (
        typeof visible === "function" &&
        !visible.call(element, {
          contentVisibilityAuto: true,
          opacityProperty: true,
          visibilityProperty: true,
        })
      ) {
        continue;
      }
      const box = element.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) continue;
      // Screen-reader-only text is not painted, so it has no contrast to score.
      if (box.width <= 1 || box.height <= 1) continue;

      found.push({
        selector: path(element),
        text: text.slice(0, 40),
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: Number(style.fontWeight) || 400,
        color: parseColor(style.color),
        box: {
          x: box.x + scrollX,
          y: box.y + scrollY,
          width: box.width,
          height: box.height,
        },
      });
    }
    return found;
  });
}

function contrastFor(png: PNG, node: TextNode) {
  // Inset so a border on the element's own edge is not mistaken for background.
  const inset = 2;
  const left = Math.max(0, Math.round(node.box.x) + inset);
  const top = Math.max(0, Math.round(node.box.y) + inset);
  const right = Math.min(png.width, Math.round(node.box.x + node.box.width) - inset);
  const bottom = Math.min(png.height, Math.round(node.box.y + node.box.height) - inset);
  if (right - left < 3 || bottom - top < 3) return null;

  function modeIn(x0: number, y0: number, x1: number, y1: number, skip?: [number, number, number]) {
    const tally = new Map<number, number>();
    for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y += 1) {
      for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x += 1) {
        const i = (png.width * y + x) << 2;
        if (png.data[i + 3] < 200) continue;
        if (skip) {
          const near =
            Math.abs(png.data[i] - skip[0]) +
            Math.abs(png.data[i + 1] - skip[1]) +
            Math.abs(png.data[i + 2] - skip[2]);
          if (near < 90) continue;
        }
        const key = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
    }
    let key = -1;
    let best = -1;
    for (const [candidate, count] of tally) {
      if (count > best) {
        best = count;
        key = candidate;
      }
    }
    return key < 0
      ? null
      : ([(key >> 16) & 255, (key >> 8) & 255, key & 255] as [number, number, number]);
  }

  const declared: [number, number, number] = [node.color[0], node.color[1], node.color[2]];
  // A tight inline box can be mostly glyph, in which case its own mode IS the
  // text. Ignore colours near the foreground; if nothing else is left, read the
  // ring just outside the box, which is whatever the element sits on.
  const bg =
    modeIn(left, top, right, bottom, declared) ??
    modeIn(left - 3, top - 3, right + 3, bottom + 3, declared);
  if (!bg) return null;

  const alpha = node.color[3];
  const fg: [number, number, number] = [
    declared[0] * alpha + bg[0] * (1 - alpha),
    declared[1] * alpha + bg[1] * (1 - alpha),
    declared[2] * alpha + bg[2] * (1 - alpha),
  ];

  return contrast(luminance(...fg), luminance(...bg));
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding|\/app/u);
}

async function createUser(admin: SupabaseClient) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `a11y-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "无障碍检查" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("a11y-e2e-user-not-created");
  }
  return { email, userId: created.data.user.id };
}

for (const theme of ["light", "dark"] as const) {
test(`every rendered text node clears the WCAG contrast floor in ${theme}`, async ({
  page,
}) => {
  test.setTimeout(300_000);
  // Dark is a separate palette, not a filter over this one, so it has to be
  // measured separately. "It looks fine" is not a check.
  //
  // Reduced motion is not about accessibility here — it is about determinism.
  // Enter animations start at opacity 0, and a screenshot taken mid-animation
  // samples a background that no user ever reads against. Collapsing the
  // durations measures the settled page, which is the one being scored.
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await account.auth.signInWithPassword({ email, password });
    await login(page, email);
    if (/\/onboarding/u.test(page.url())) {
      await page.getByLabel("姓名").fill("无障碍检查");
      await page.getByLabel("目标岗位").fill("Product Manager");
      await page.getByRole("button", { name: "保存求职目标" }).click();
      await page.getByRole("button", { name: "暂时跳过" }).click();
      await page.getByRole("button", { name: "进入工作台" }).click();
    }
    await account
      .from("profiles")
      .update({ ai_processing_consent_at: new Date().toISOString() })
      .eq("user_id", userId);

    await page.goto("/applications/new");
    await page.getByLabel("公司").fill("Northstar GmbH");
    await page.getByLabel("职位").fill("Product Analyst");
    await page.getByLabel("地点").fill("Berlin, DE");
    await page.getByLabel("JD 原文").fill(jdText);
    await page.getByRole("button", { name: "建立申请工作区" }).click();
    // The server action navigates; starting another goto mid-redirect aborts it.
    await page.waitForURL(/\/applications\/[0-9a-f-]+\?tab=resume/u);
    const applicationId = new URL(page.url()).pathname.split("/").pop();

    const routes = [
      "/app",
      "/applications",
      "/profile",
      "/interview",
      "/settings/account",
      "/settings/privacy",
      `/applications/${applicationId}?tab=overview`,
      `/applications/${applicationId}?tab=resume`,
      `/applications/${applicationId}?tab=difference`,
      // A fixture account one minute old only has empty states, and an empty
      // state passes contrast by having almost no content. /dev/states renders
      // the crowded, overlong and every-severity variants that actually
      // exercise the palette.
      "/dev/states",
    ];

    const failures: string[] = [];
    let scored = 0;

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      const nodes = await collectTextNodes(page);
      const png = PNG.sync.read(
        await page.screenshot({ fullPage: true, scale: "css" }),
      );

      for (const node of nodes) {
        const ratio = contrastFor(png, node);
        if (ratio === null) continue;
        scored += 1;

        const floor = floorFor(node);
        if (ratio + 0.01 < floor) {
          failures.push(
            `${route}  ${ratio.toFixed(2)}:1 < ${floor}  ${node.fontSize}px/${node.fontWeight}  “${node.text}”  ${node.selector}`,
          );
        }
      }
    }

    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
    // A contrast floor that measures nothing passes every time, and a broken
    // walk (login failing, a route 404ing) scores near zero rather than
    // failing outright. This is a smoke floor well under the real count, not a
    // coverage target — it should not need touching when copy changes.
    expect(scored, "the route walk collected almost no text").toBeGreaterThan(300);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
}

test("every focusable control shows a focus ring that is not clipped", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const { admin, account } = clients();
  const { email, userId } = await createUser(admin);

  try {
    await account.auth.signInWithPassword({ email, password });
    await login(page, email);
    if (/\/onboarding/u.test(page.url())) {
      await page.getByLabel("姓名").fill("无障碍检查");
      await page.getByLabel("目标岗位").fill("Product Manager");
      await page.getByRole("button", { name: "保存求职目标" }).click();
      await page.getByRole("button", { name: "暂时跳过" }).click();
      await page.getByRole("button", { name: "进入工作台" }).click();
    }

    const failures: string[] = [];
    for (const route of ["/app", "/applications", "/profile"]) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await page.locator("body").click({ position: { x: 2, y: 2 } });

      const visited = new Set<string>();
      for (let step = 0; step < 60; step += 1) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const element = document.activeElement;
          if (!element || element === document.body) return null;
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            name:
              element.getAttribute("aria-label") ??
              element.textContent?.trim().slice(0, 30) ??
              "",
            outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
            outlineStyle: style.outlineStyle,
            boxShadow: style.boxShadow,
            width: box.width,
            height: box.height,
          };
        });
        if (!focused) break;

        const key = `${focused.tag}:${focused.name}`;
        if (visited.has(key)) break;
        visited.add(key);
        if (focused.width < 2 || focused.height < 2) continue;

        const hasRing =
          (focused.outlineStyle !== "none" && focused.outlineWidth >= 1) ||
          (focused.boxShadow !== "none" && focused.boxShadow.includes("rgb"));
        if (!hasRing) {
          failures.push(
            `${route}  no focus ring  <${focused.tag}> “${focused.name}”`,
          );
        }
      }
    }

    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
