import { describe, expect, it } from "vitest";

import { loginFormSchema } from "./schema";

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
