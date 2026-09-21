import "dotenv/config";
import http from "node:http";

import { disconnectPrisma, pingDatabase } from "@/lib/db";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

/**
 * Background worker process (docs/architecture.md §10, docs/notifications.md §9).
 *
 * Phase 1 ships the process skeleton: environment validation, a health
 * endpoint, and graceful shutdown. pg-boss, the outbox relay and job handlers
 * are registered here in later phases.
 */
const log = createLogger("worker");

type Shutdownable = { close: () => Promise<void> | void };
const resources: Shutdownable[] = [];

function startHealthServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      const dbOk = await pingDatabase();
      res.writeHead(dbOk ? 200 : 503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ status: dbOk ? "ok" : "degraded", db: dbOk ? "ok" : "unreachable" }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(env.WORKER_HEALTH_PORT, () => {
    log.info({ port: env.WORKER_HEALTH_PORT }, "worker health endpoint listening");
  });
  resources.push({
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  });
  return server;
}

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, "worker shutting down");
  const timer = setTimeout(() => {
    log.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, 30_000);
  timer.unref();

  for (const resource of resources.reverse()) {
    try {
      await resource.close();
    } catch (error) {
      log.error({ err: error }, "error while closing resource");
    }
  }
  await disconnectPrisma();
  log.info("worker stopped");
  process.exit(0);
}

async function main(): Promise<void> {
  log.info({ nodeEnv: env.NODE_ENV, version: env.APP_VERSION }, "worker starting");

  const dbOk = await pingDatabase();
  if (!dbOk) {
    log.error("database unreachable at startup");
    process.exit(1);
  }

  startHealthServer();

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    log.error({ err: reason }, "unhandled rejection");
  });

  log.info("worker ready");
}

main().catch((error: unknown) => {
  log.fatal({ err: error }, "worker failed to start");
  process.exit(1);
});
