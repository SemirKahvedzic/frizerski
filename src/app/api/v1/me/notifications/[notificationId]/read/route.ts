import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { sessionAuth, type Actor } from "@/modules/auth";
import { markNotificationRead } from "@/modules/notifications";

export const dynamic = "force-dynamic";

/** POST /api/v1/me/notifications/:notificationId/read */
export const POST = defineRoute({
  ...sessionAuth,
  name: "me.notifications.read",
  auth: "session",
  params: z.object({ notificationId: z.uuid() }),
  handler: async ({ actor, params }) => {
    await markNotificationRead((actor as unknown as Actor).userId, params.notificationId);
    return { data: { id: params.notificationId, read: true } };
  },
});
