import "dotenv/config";
import http from "node:http";

import { PgBoss, type Job } from "pg-boss";

import { disconnectPrisma, pingDatabase } from "@/lib/db";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import {
  JOBS,
  dispatchBookingEvent,
  outboxLagSeconds,
  relayOutbox,
  sendDueReminder,
  sendEmailNotification,
  sweepReminders,
  type DomainEvent,
} from "@/modules/notifications";

import { PgBossQueue, ensureQueues } from "./pgboss-queue";

/**
 * Background worker (docs/architecture.md §10, docs/notifications.md §9):
 * pg-boss queues, the outbox relay, reminder scheduling/sweep and a health
 * endpoint. Multiple replicas are safe: the relay uses SKIP LOCKED, sends are
 * idempotent and reminders are claimed atomically.
 */
const log = createLogger("worker");

type Shutdownable = { close: () => Promise<void> | void };
const resources: Shutdownable[] = [];
let bossStarted = false;

function startHealthServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      const dbOk = await pingDatabase();
      const lag = dbOk ? await outboxLagSeconds().catch(() => -1) : -1;
      const ok = dbOk && bossStarted && lag >= 0 && lag < 60;
      res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: ok ? "ok" : "degraded",
          db: dbOk ? "ok" : "unreachable",
          queue: bossStarted ? "ok" : "stopped",
          outboxLagSeconds: lag,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.on("error", (error) => {
    log.fatal({ err: error, port: env.WORKER_HEALTH_PORT }, "health endpoint failed to start");
    process.exit(1);
  });
  server.listen(env.WORKER_HEALTH_PORT, () => {
    log.info({ port: env.WORKER_HEALTH_PORT }, "worker health endpoint listening");
  });
  resources.push({
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  });
  return server;
}

async function startQueue(): Promise<PgBossQueue> {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.PGBOSS_SCHEMA,
    max: 5,
    application_name: "salon-worker",
  });
  boss.on("error", (error: Error) => log.error({ err: error }, "pg-boss error"));
  await boss.start();
  await ensureQueues(boss);
  bossStarted = true;
  const queue = new PgBossQueue(boss);

  await boss.work<DomainEvent>(
    JOBS.dispatch,
    { localConcurrency: 5 },
    async (jobs: Job<DomainEvent>[]) => {
      for (const job of jobs) await dispatchBookingEvent(job.data, { queue });
    },
  );
  await boss.work<{ notificationId: string }>(
    JOBS.sendEmail,
    { localConcurrency: 10 },
    async (jobs: Job<{ notificationId: string }>[]) => {
      for (const job of jobs) await sendEmailNotification(job.data.notificationId);
    },
  );
  await boss.work<{ reminderId: string }>(
    JOBS.reminderSend,
    { localConcurrency: 10 },
    async (jobs: Job<{ reminderId: string }>[]) => {
      for (const job of jobs) {
        const outcome = await sendDueReminder(job.data.reminderId, { queue });
        log.debug({ reminderId: job.data.reminderId, outcome }, "reminder processed");
      }
    },
  );
  await boss.schedule(JOBS.reminderSweep, "* * * * *");
  await boss.work(JOBS.reminderSweep, async () => {
    await sweepReminders(queue);
  });

  resources.push({
    close: async () => {
      bossStarted = false;
      await boss.stop({ graceful: true, timeout: 25_000, close: true });
    },
  });
  return queue;
}

function startOutboxRelay(queue: PgBossQueue): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      let processed = await relayOutbox(queue);
      while (processed >= 100) processed = await relayOutbox(queue);
    } catch (error) {
      log.error({ err: error }, "outbox relay failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), env.OUTBOX_POLL_MS);
  void tick();
  resources.push({ close: () => clearInterval(timer) });
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

  const queue = await startQueue();
  startOutboxRelay(queue);
  await sweepReminders(queue).catch((error) => log.error({ err: error }, "initial sweep failed"));
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
