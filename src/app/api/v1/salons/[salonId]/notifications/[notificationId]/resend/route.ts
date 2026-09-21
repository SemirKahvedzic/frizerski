import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { resendNotification } from "@/modules/notifications";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

/** POST /api/v1/salons/:salonId/notifications/:notificationId/resend */
export const POST = defineRoute({
  ...sessionAuth,
  name: "salons.notifications.resend",
  auth: "session",
  params: z.object({ salonId: z.uuid(), notificationId: z.uuid() }),
  handler: async ({ actor, params, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await resendNotification(ctx, params.notificationId) };
  },
});
