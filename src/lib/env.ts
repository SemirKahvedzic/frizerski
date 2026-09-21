import { z } from "zod";

/**
 * Environment configuration, validated with Zod.
 *
 * Parsed lazily on first access so that `next build` (which imports route
 * modules without a runtime environment) does not fail; the first real request
 * or worker start validates and fails fast with a readable message.
 *
 * Add variables here as phases introduce providers (docs/setup.md §3).
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  APP_NAME: z.string().min(1).default("Bookly"),
  APP_VERSION: z.string().default("0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** pg-boss schema name; the worker creates it on first start. */
  PGBOSS_SCHEMA: z.string().min(1).default("pgboss"),
  OUTBOX_POLL_MS: z.coerce.number().int().min(250).max(60_000).default(2000),

  RATE_LIMIT_PROVIDER: z.enum(["memory", "postgres"]).default("memory"),

  // --- Auth (Better Auth) ---
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Better Auth's built-in limiter; `off` only for automated test runs. */
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),

  // --- Email ---
  EMAIL_PROVIDER: z.enum(["smtp", "resend", "console", "fake"]).default("smtp"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(3).default("Bookly <no-reply@localhost>"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

export type EnvSource = Record<string, string | undefined>;

export function parseEnv(source: EnvSource = process.env): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new EnvValidationError(issues);
  }
  return result.data;
}

export function getEnv(): ServerEnv {
  if (!cached) {
    cached = parseEnv();
  }
  return cached;
}

/** Test helper: forget the cached environment so the next access re-parses. */
export function resetEnvCache(): void {
  cached = undefined;
}

/** Ergonomic accessor: `env.DATABASE_URL` parses on first property read. */
export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, property) {
    return getEnv()[property as keyof ServerEnv];
  },
  has(_target, property) {
    return property in getEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv());
  },
  getOwnPropertyDescriptor(_target, property) {
    return { enumerable: true, configurable: true, value: getEnv()[property as keyof ServerEnv] };
  },
});

export const isProduction = () => getEnv().NODE_ENV === "production";
export const isTest = () => getEnv().NODE_ENV === "test";
