import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

import { loginFormSchema } from "./schema";
import { signup } from "./actions";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);
const mockedCookies = vi.mocked(cookies);

/** A cookie jar holding whatever the visitor picked, or nothing. */
function jar(locale?: string) {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === "interface-locale" && locale ? { name, value: locale } : undefined,
  } as never);
}

describe("loginFormSchema", () => {
  it("normalizes email and requires an eight-character password", () => {
    expect(
      loginFormSchema.parse({
        email: " USER@example.com ",
        password: "password1",
      }),
    ).toEqual({ email: "user@example.com", password: "password1" });

    expect(() =>
      loginFormSchema.parse({ email: "user@example.com", password: "short" }),
    ).toThrow();
  });
});

describe("signup", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://career.example";
    jar();
  });

  it("redirects default confirmation links to onboarding", async () => {
    const signUp = vi.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({ auth: { signUp } } as never);
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "password1");

    await signup({ error: null, message: null }, formData);

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo:
            "https://career.example/auth/callback?next=/onboarding",
          data: undefined,
        },
      }),
    );
  });

  it("carries the language the visitor picked at the door", async () => {
    // The switch on the signed-out pages is all someone without an account
    // has. Without this, they would pick 中文, sign up, and land back in
    // English because a new profile takes the column default.
    jar("zh-CN");
    const signUp = vi.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({ auth: { signUp } } as never);
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "password1");

    await signup({ error: null, message: null }, formData);

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: { interface_locale: "zh-CN" },
        }),
      }),
    );
  });

  it("ignores a cookie holding something nobody wrote", async () => {
    // A cookie is client data. Passing it through would reach a column whose
    // check constraint would abort the sign-up — so a malformed one has to
    // cost the visitor their language preference, not their account.
    jar("de-DE");
    const signUp = vi.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({ auth: { signUp } } as never);
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "password1");

    const result = await signup({ error: null, message: null }, formData);

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ data: undefined }),
      }),
    );
    expect(result.error).toBeNull();
  });
});
