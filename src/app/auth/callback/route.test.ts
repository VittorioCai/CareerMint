// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";

import { GET } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

function request(path: string) {
  return new Request(`http://localhost${path}`);
}

function location(response: Response) {
  return response.headers.get("location");
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("verifies signup token hashes and redirects to onboarding", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({ auth: { verifyOtp } } as never);

    const response = await GET(
      request(
        "/auth/callback?token_hash=signup-token&type=email&next=/onboarding",
      ),
    );

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "signup-token",
      type: "email",
    });
    expect(location(response)).toBe("http://localhost/onboarding");
  });

  it("redirects malformed or failed OTP callbacks with invalid-link", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      error: {
        code: "unexpected_failure",
        message: "provider details must stay private",
      },
    });
    mockedCreateClient.mockResolvedValue({ auth: { verifyOtp } } as never);

    const response = await GET(
      request("/auth/callback?token_hash=expired&type=email"),
    );
    const malformed = await GET(
      request("/auth/callback?token_hash=missing-type"),
    );

    expect(location(response)).toBe("http://localhost/login?error=invalid-link");
    expect(location(malformed)).toBe("http://localhost/login?error=invalid-link");
  });

  it("redirects consumed or expired OTP callbacks with login guidance", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      error: {
        code: "otp_expired",
        name: "AuthApiError",
        message: "Email link is invalid or has expired",
      },
    });
    mockedCreateClient.mockResolvedValue({ auth: { verifyOtp } } as never);

    const response = await GET(
      request(
        "/auth/callback?token_hash=used-or-expired&type=email&next=/onboarding",
      ),
    );

    expect(location(response)).toBe(
      "http://localhost/login?error=email-link-used",
    );
  });

  it("redirects default confirmation OTP failures with login guidance", async () => {
    const response = await GET(
      request(
        "/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired&next=/onboarding",
      ),
    );

    expect(location(response)).toBe(
      "http://localhost/login?error=email-link-used",
    );
  });

  it("keeps reset-password OTP failures as invalid-link", async () => {
    const defaultResponse = await GET(
      request(
        "/auth/callback?next=/reset-password&error=access_denied&error_code=otp_expired",
      ),
    );

    const verifyOtp = vi.fn().mockResolvedValue({
      error: { code: "otp_expired" },
    });
    mockedCreateClient.mockResolvedValue({ auth: { verifyOtp } } as never);
    const tokenResponse = await GET(
      request(
        "/auth/callback?token_hash=used-or-expired&type=email&next=/reset-password",
      ),
    );

    expect(location(defaultResponse)).toBe(
      "http://localhost/login?error=invalid-link",
    );
    expect(location(tokenResponse)).toBe(
      "http://localhost/login?error=invalid-link",
    );
  });

  it("keeps provider errors and missing credentials as invalid-link", async () => {
    const providerError = await GET(
      request(
        "/auth/callback?error=access_denied&error_code=unexpected_failure&error_description=Provider%20failure",
      ),
    );
    const missingCredentials = await GET(request("/auth/callback"));

    expect(location(providerError)).toBe(
      "http://localhost/login?error=invalid-link",
    );
    expect(location(missingCredentials)).toBe(
      "http://localhost/login?error=invalid-link",
    );
  });

  it("preserves legacy code exchange and redirects to the requested destination", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);

    const response = await GET(
      request("/auth/callback?code=legacy-code&next=/reset-password"),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("legacy-code");
    expect(location(response)).toBe("http://localhost/reset-password");
  });

  it("reports failed legacy exchanges as session-not-created", async () => {
    const exchangeCodeForSession = vi
      .fn()
      .mockResolvedValue({ error: new Error("provider details") });
    mockedCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);

    const response = await GET(request("/auth/callback?code=legacy-code"));

    expect(location(response)).toBe(
      "http://localhost/login?error=session-not-created",
    );
  });

  it("rejects missing credentials and falls back from open redirects to /app", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);

    const missing = await GET(request("/auth/callback"));
    const openRedirect = await GET(
      request("/auth/callback?code=legacy-code&next=https%3A%2F%2Fevil.example"),
    );

    expect(location(missing)).toBe("http://localhost/login?error=invalid-link");
    expect(location(openRedirect)).toBe("http://localhost/app");
  });
});

describe("confirmation email template", () => {
  it("contains the server-side token hash callback contract", async () => {
    const template = await readFile(
      resolve(process.cwd(), "supabase/templates/confirmation.html"),
      "utf8",
    );

    expect(template).toContain("{{ .RedirectTo }}");
    expect(template).toContain("token_hash={{ .TokenHash }}");
    expect(template).toContain("type=email");
    expect(template).toContain(
      "&amp;token_hash={{ .TokenHash }}&amp;type=email",
    );

    const config = await readFile(
      resolve(process.cwd(), "supabase/config.toml"),
      "utf8",
    );
    expect(config).toContain("[auth.email.template.confirmation]");
    expect(config).toContain(
      'content_path = "./supabase/templates/confirmation.html"',
    );
  });
});
