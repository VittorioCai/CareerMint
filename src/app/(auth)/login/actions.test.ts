import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";

import { loginFormSchema } from "./schema";
import { signup } from "./actions";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

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
        },
      }),
    );
  });
});
