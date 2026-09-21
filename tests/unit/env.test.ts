import { describe, expect, it } from "vitest";

import { EnvValidationError, parseEnv } from "@/lib/env";

const REQUIRED = {
  DATABASE_URL: "postgresql://x",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("parseEnv", () => {
  it("applies defaults and coerces numbers", () => {
    const env = parseEnv({ ...REQUIRED, DATABASE_POOL_MAX: "5" });
    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.DATABASE_POOL_MAX).toBe(5);
    expect(env.WORKER_HEALTH_PORT).toBe(3001);
  });

  it("fails fast with readable messages when required variables are missing", () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
    try {
      parseEnv({ APP_URL: "not-a-url" });
    } catch (error) {
      const issues = (error as EnvValidationError).issues;
      expect(issues.some((i) => i.startsWith("DATABASE_URL"))).toBe(true);
      expect(issues.some((i) => i.startsWith("APP_URL"))).toBe(true);
      expect(issues.some((i) => i.startsWith("BETTER_AUTH_SECRET"))).toBe(true);
    }
  });

  it("rejects unknown enum values", () => {
    expect(() => parseEnv({ ...REQUIRED, LOG_LEVEL: "loud" })).toThrow(EnvValidationError);
  });
});
