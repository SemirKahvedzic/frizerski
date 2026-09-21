"use server";

import { z } from "zod";

import { defineAuthedAction } from "@/modules/auth/action";
import { resendNotification } from "@/modules/notifications";
import { resolveTenantContext } from "@/modules/tenant";

export const resendNotificationAction = defineAuthedAction({
  name: "salon.notifications.resend",
  schema: z.object({ salonSlug: z.string().min(1), notificationId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await resolveTenantContext(principal, { slug: input.salonSlug }, { requestId });
    const row = await resendNotification(ctx, input.notificationId);
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
    };
  },
});
