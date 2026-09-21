import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { DomainEvent } from "@/modules/notifications/events";
import { JOBS, type JobQueue } from "@/modules/notifications/queue";

const log = logger.child({ module: "outbox" });

export const OUTBOX_MAX_ATTEMPTS = 10;

type OutboxRow = {
  id: string;
  salon_id: string | null;
  type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  occurred_at: Date;
  attempts: number;
};

/**
 * Publishes PENDING outbox rows to the queue (docs/notifications.md §1).
 * Rows are locked with `FOR UPDATE SKIP LOCKED` so several relays can run.
 * Returns the number of rows processed.
 */
export async function relayOutbox(
  queue: JobQueue,
  options: { batchSize?: number } = {},
): Promise<number> {
  const batchSize = options.batchSize ?? 100;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT id, salon_id, type, aggregate_type, aggregate_id, payload, occurred_at, attempts
        FROM outbox_events
       WHERE status = 'PENDING'
       ORDER BY occurred_at
       LIMIT ${batchSize}
         FOR UPDATE SKIP LOCKED`;

    for (const row of rows) {
      const event: DomainEvent = {
        id: row.id,
        type: row.type,
        salonId: row.salon_id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        payload: row.payload,
        occurredAt: row.occurred_at.toISOString(),
      };
      try {
        await queue.send(JOBS.dispatch, event, { singletonKey: `outbox:${row.id}` });
        await tx.outboxEvent.update({
          where: { id: row.id },
          data: { status: "PUBLISHED", publishedAt: new Date(), attempts: row.attempts + 1 },
        });
      } catch (error) {
        const attempts = row.attempts + 1;
        await tx.outboxEvent.update({
          where: { id: row.id },
          data: {
            attempts,
            lastError: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
            status: attempts >= OUTBOX_MAX_ATTEMPTS ? "FAILED" : "PENDING",
          },
        });
        log.error({ err: error, eventId: row.id, attempts }, "outbox publish failed");
      }
    }
    return rows.length;
  });
}

/** Age of the oldest unpublished event in seconds (0 when the outbox is empty). */
export async function outboxLagSeconds(): Promise<number> {
  const rows = await prisma.$queryRaw<{ lag: number | null }[]>`
    SELECT EXTRACT(EPOCH FROM now() - min(occurred_at))::float8 AS lag
      FROM outbox_events WHERE status = 'PENDING'`;
  return Math.max(0, Math.round(rows[0]?.lag ?? 0));
}
