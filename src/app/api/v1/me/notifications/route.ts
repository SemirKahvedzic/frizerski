import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { sessionAuth, type Actor } from "@/modules/auth";
import { listNotificationsForUser } from "@/modules/notifications";

export const dynamic = "force-dynamic";

/** GET /api/v1/me/notifications?limit&unread — in-app notification feed. */
export const GET = defineRoute({
  ...sessionAuth,
  name: "me.notifications.list",
  auth: "session",
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    unread: z.enum(["true", "false"]).optional(),
  }),
  handler: async ({ actor, query }) => {
    const result = await listNotificationsForUser((actor as unknown as Actor).userId, {
      limit: query.limit,
      unreadOnly: query.unread === "true",
    });
    return { data: result.items, meta: { unread: result.unread } };
  },
});
