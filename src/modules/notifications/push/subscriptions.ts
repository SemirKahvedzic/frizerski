import { z } from "zod";

import { prisma } from "@/lib/db";

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(256) }),
  userAgent: z.string().max(512).optional(),
  locale: z.string().max(10).optional(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.url().max(2048) });

export type PushSubscriptionView = {
  id: string;
  endpoint: string;
  platform: "WEB" | "IOS" | "ANDROID";
  userAgent: string | null;
  lastSeenAt: Date;
  failedAt: Date | null;
};

const select = {
  id: true,
  endpoint: true,
  platform: true,
  userAgent: true,
  lastSeenAt: true,
  failedAt: true,
} as const;

/**
 * Registers (or refreshes) a browser subscription. The endpoint is unique
 * across users: a device that signs in as somebody else moves with them.
 * The first subscription flips `NotificationPreference.pushEnabled` on.
 */
export async function upsertPushSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<PushSubscriptionView> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        platform: "WEB",
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        locale: input.locale ?? null,
      },
      update: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        locale: input.locale ?? null,
        lastSeenAt: new Date(),
        failedAt: null,
      },
      select,
    });
    await tx.notificationPreference.upsert({
      where: { userId },
      create: { userId, pushEnabled: true },
      update: { pushEnabled: true },
    });
    return row;
  });
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const result = await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return result.count > 0;
}

export async function listPushSubscriptions(userId: string): Promise<PushSubscriptionView[]> {
  return prisma.pushSubscription.findMany({
    where: { userId, failedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select,
  });
}

/** Marks a subscription dead after the push service reported 404/410. */
export async function markPushSubscriptionGone(id: string): Promise<void> {
  await prisma.pushSubscription.update({ where: { id }, data: { failedAt: new Date() } });
}
