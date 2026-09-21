import { defineRoute } from "@/lib/api/define-route";
import {
  getNotificationPreferences,
  notificationPreferencesSchema,
  updateNotificationPreferences,
} from "@/modules/account";
import { sessionAuth, type Actor } from "@/modules/auth";

export const dynamic = "force-dynamic";

/** GET /api/v1/me/notification-preferences */
export const GET = defineRoute({
  ...sessionAuth,
  name: "me.notificationPreferences.get",
  auth: "session",
  handler: async ({ actor }) => ({
    data: await getNotificationPreferences((actor as unknown as Actor).userId),
  }),
});

/** PUT /api/v1/me/notification-preferences */
export const PUT = defineRoute({
  ...sessionAuth,
  name: "me.notificationPreferences.update",
  auth: "session",
  body: notificationPreferencesSchema,
  handler: async ({ actor, body }) => ({
    data: await updateNotificationPreferences((actor as unknown as Actor).userId, body),
  }),
});
