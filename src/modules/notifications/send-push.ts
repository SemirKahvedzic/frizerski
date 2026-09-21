import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { MAX_SEND_ATTEMPTS } from "@/modules/notifications/persist";
import { getPushProvider } from "@/modules/notifications/push";
import { markPushSubscriptionGone } from "@/modules/notifications/push/subscriptions";
import type { PushMessage } from "@/modules/notifications/push/types";

const log = logger.child({ module: "notifications" });

export type PushOutcome = "sent" | "skipped" | "failed";

/**
 * Handler for `notification.sendPush`: delivers one PUSH notification row to
 * every live subscription of its user. Expired subscriptions (404/410) are
 * marked so they are never tried again. SENT when at least one device got
 * it; SKIPPED when the user has no live devices; otherwise retried/FAILED.
 */
export async function sendPushNotification(notificationId: string): Promise<PushOutcome> {
  const row = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!row || row.channel !== "PUSH" || row.status !== "QUEUED" || !row.userId) return "skipped";

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: row.userId, failedAt: null },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subscriptions.length === 0) {
    await prisma.notification.update({
      where: { id: row.id },
      data: { status: "SKIPPED", error: "recipient.noSubscription" },
    });
    return "skipped";
  }

  const provider = getPushProvider();
  const message = row.payload as unknown as PushMessage;
  let delivered = 0;
  const errors: string[] = [];
  for (const subscription of subscriptions) {
    const result = await provider.send(subscription, message);
    if (result.ok) {
      delivered += 1;
      continue;
    }
    errors.push(result.error);
    if (result.gone) await markPushSubscriptionGone(subscription.id);
  }

  if (delivered > 0) {
    await prisma.notification.update({
      where: { id: row.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        attempts: { increment: 1 },
        providerMessageId: `${provider.name}:${delivered}/${subscriptions.length}`,
        error: errors.length > 0 ? errors.join("; ").slice(0, 1000) : null,
      },
    });
    log.info({ notificationId: row.id, delivered, total: subscriptions.length }, "push.sent");
    return "sent";
  }

  const allGone = errors.length === subscriptions.length && subscriptions.every(() => true);
  const attempts = row.attempts + 1;
  const terminal = attempts >= MAX_SEND_ATTEMPTS || allGone;
  await prisma.notification.update({
    where: { id: row.id },
    data: {
      attempts,
      error: errors.join("; ").slice(0, 1000),
      status: terminal ? "FAILED" : "QUEUED",
    },
  });
  log.error({ notificationId: row.id, attempts, errors }, "push.failed");
  if (terminal) return "failed";
  throw new Error(`push delivery failed: ${errors[0]}`);
}
