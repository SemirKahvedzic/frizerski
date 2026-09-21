import { z } from "zod";

import { decodeCursor, paginationQuerySchema, toPage, type Page } from "@/lib/api/pagination";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { authorize } from "@/modules/auth/authorize";
import { sendEmailNotification } from "@/modules/notifications/dispatcher";
import type { TenantContext } from "@/modules/tenant/context";

/** Notification log entries as shown to salon staff and returned by the API. */
export type NotificationLogItem = {
  id: string;
  bookingId: string | null;
  channel: "EMAIL" | "PUSH" | "IN_APP";
  type: string;
  status: "QUEUED" | "SENT" | "FAILED" | "SKIPPED";
  recipient: string;
  locale: string;
  subject: string | null;
  attempts: number;
  error: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

const select = {
  id: true,
  bookingId: true,
  channel: true,
  type: true,
  status: true,
  recipient: true,
  locale: true,
  subject: true,
  attempts: true,
  error: true,
  createdAt: true,
  sentAt: true,
} as const;

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  bookingId: z.uuid().optional(),
  status: z.enum(["QUEUED", "SENT", "FAILED", "SKIPPED"]).optional(),
  channel: z.enum(["EMAIL", "PUSH", "IN_APP"]).optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

const cursorSchema = z.object({ createdAt: z.string(), id: z.string() });

export async function listNotificationsForSalon(
  ctx: TenantContext,
  query: ListNotificationsQuery,
): Promise<Page<NotificationLogItem>> {
  authorize(ctx.actor, "notification.read", { salonId: ctx.salonId });
  const cursor = decodeCursor(query.cursor, cursorSchema);
  const rows = await ctx.db.notification.findMany({
    where: {
      salonId: ctx.salonId,
      bookingId: query.bookingId,
      status: query.status,
      channel: query.channel,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    select,
  });
  return toPage(rows, query.limit, (row) => ({
    createdAt: row.createdAt.toISOString(),
    id: row.id,
  }));
}

/** Re-queues a FAILED (or already SENT) email and sends it right away. */
export async function resendNotification(
  ctx: TenantContext,
  notificationId: string,
): Promise<NotificationLogItem> {
  authorize(ctx.actor, "booking.update", { salonId: ctx.salonId });
  const row = await ctx.db.notification.findFirst({
    where: { id: notificationId, salonId: ctx.salonId },
    select: { id: true, channel: true, status: true },
  });
  if (!row) throw new NotFoundError("Notification");
  if (row.channel !== "EMAIL") throw new ConflictError("Only email notifications can be resent.");
  if (row.status === "QUEUED") throw new ConflictError("Notification is already queued.");
  await ctx.db.notification.update({
    where: { id: row.id },
    data: { status: "QUEUED", attempts: 0, error: null },
  });
  try {
    await sendEmailNotification(row.id);
  } catch {
    // The row keeps the error; the caller sees the refreshed status below.
  }
  const fresh = await ctx.db.notification.findFirstOrThrow({ where: { id: row.id }, select });
  return fresh;
}

export async function listNotificationsForUser(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<{
  items: (NotificationLogItem & { readAt: Date | null; url: string | null })[];
  unread: number;
}> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, channel: "IN_APP", ...(options.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 20,
      select: { ...select, readAt: true, payload: true },
    }),
    prisma.notification.count({ where: { userId, channel: "IN_APP", readAt: null } }),
  ]);
  return {
    items: rows.map(({ payload, ...row }) => ({
      ...row,
      url: ((payload as { url?: string | null } | null)?.url ?? null) as string | null,
    })),
    unread,
  };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, channel: "IN_APP", readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.notification.count({ where: { id: notificationId, userId } });
    if (exists === 0) throw new NotFoundError("Notification");
  }
}
