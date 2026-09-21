import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { listNotificationsForSalon, listNotificationsQuerySchema } from "@/modules/notifications";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

/** GET /api/v1/salons/:salonId/notifications?bookingId&status&channel&cursor&limit */
export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.notifications.list",
  auth: "session",
  params: z.object({ salonId: z.uuid() }),
  query: listNotificationsQuerySchema,
  handler: async ({ actor, params, query, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    const page = await listNotificationsForSalon(ctx, query);
    return { data: page.items, meta: { nextCursor: page.nextCursor } };
  },
});
