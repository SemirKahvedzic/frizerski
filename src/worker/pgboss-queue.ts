import type { PgBoss } from "pg-boss";

import { JOBS, type JobName, type JobQueue, type SendJobOptions } from "@/modules/notifications";

/** Queue definitions: retry policy per job type (docs/notifications.md §9). */
export const QUEUE_DEFINITIONS: { name: JobName; retryLimit: number; retryDelay: number }[] = [
  { name: JOBS.dispatch, retryLimit: 5, retryDelay: 5 },
  { name: JOBS.sendEmail, retryLimit: 5, retryDelay: 30 },
  { name: JOBS.sendPush, retryLimit: 3, retryDelay: 30 },
  { name: JOBS.reminderSend, retryLimit: 3, retryDelay: 60 },
  { name: JOBS.reminderSweep, retryLimit: 0, retryDelay: 0 },
];

/** `JobQueue` port bound to pg-boss. */
export class PgBossQueue implements JobQueue {
  constructor(private readonly boss: PgBoss) {}

  async send(
    name: JobName,
    data: Record<string, unknown>,
    options: SendJobOptions = {},
  ): Promise<string | null> {
    return this.boss.send(name, data, {
      startAfter: options.startAfter,
      singletonKey: options.singletonKey,
    });
  }
}

export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const q of QUEUE_DEFINITIONS) {
    await boss.createQueue(q.name, {
      retryLimit: q.retryLimit,
      retryDelay: q.retryDelay,
      retryBackoff: q.retryLimit > 0,
      expireInSeconds: 15 * 60,
      deleteAfterSeconds: 7 * 24 * 3600,
    });
  }
}
