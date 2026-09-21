import pino, { type Logger, type LoggerOptions } from "pino";

/**
 * Structured JSON logging (docs/architecture.md §8).
 *
 * Every log line carries `service` and, when available, `requestId`, `userId`,
 * `salonId`. Use `logger.child({...})` to bind request or job context.
 * Pretty output is enabled outside production when pino-pretty is installed.
 */
function resolveLevel(): string {
  return process.env["LOG_LEVEL"] ?? (process.env["NODE_ENV"] === "production" ? "info" : "debug");
}

function buildOptions(service: string): LoggerOptions {
  const isProduction = process.env["NODE_ENV"] === "production";
  const isTest = process.env["NODE_ENV"] === "test";

  const options: LoggerOptions = {
    level: isTest ? (process.env["LOG_LEVEL"] ?? "silent") : resolveLevel(),
    base: { service },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.passwordHash",
        "*.token",
        "*.secret",
      ],
      censor: "[redacted]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  if (!isProduction && !isTest) {
    options.transport = {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname,service" },
    };
  }

  return options;
}

const globalForLogger = globalThis as unknown as { __appLogger?: Logger };

export function createLogger(service: string): Logger {
  return pino(buildOptions(service));
}

/** Process-wide logger. `SERVICE_NAME` distinguishes web and worker output. */
export const logger: Logger =
  globalForLogger.__appLogger ?? createLogger(process.env["SERVICE_NAME"] ?? "web");

if (process.env["NODE_ENV"] !== "production") {
  globalForLogger.__appLogger = logger;
}

export type { Logger };
