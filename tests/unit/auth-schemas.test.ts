import { describe, expect, it } from "vitest";

import { registerSchema, safeNextPath } from "@/modules/auth/schemas";

describe("registerSchema", () => {
  const valid = {
    firstName: "Ana",
    lastName: "Anić",
    email: " Ana@Example.com ",
    phone: "+387 61 123 456",
    password: "password123",
    confirmPassword: "password123",
  };

  it("normalizes email and accepts a valid payload", () => {
    const result = registerSchema.parse(valid);
    expect(result.email).toBe("ana@example.com");
  });

  it("rejects mismatched passwords with a translation key on confirmPassword", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "other" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "confirmPassword");
      expect(issue?.message).toBe("auth.validation.passwordMatch");
    }
  });

  it("rejects short passwords and bad phones", () => {
    expect(
      registerSchema.safeParse({ ...valid, password: "short", confirmPassword: "short" }).success,
    ).toBe(false);
    expect(registerSchema.safeParse({ ...valid, phone: "abc" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, phone: "" }).success).toBe(true);
  });
});

describe("safeNextPath", () => {
  it("allows same-origin relative paths only", () => {
    expect(safeNextPath("/bs/account", "/x")).toBe("/bs/account");
    expect(safeNextPath("//evil.com", "/x")).toBe("/x");
    expect(safeNextPath("https://evil.com", "/x")).toBe("/x");
    expect(safeNextPath("/a\\b", "/x")).toBe("/x");
    expect(safeNextPath(null, "/x")).toBe("/x");
  });
});
