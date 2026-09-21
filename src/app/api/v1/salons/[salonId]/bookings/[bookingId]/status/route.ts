import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { changeBookingStatus, changeStatusSchema } from "@/modules/booking";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

export const POST = defineRoute({
  ...sessionAuth,
  name: "salons.bookings.status",
  auth: "session",
  params: z.object({ salonId: z.uuid(), bookingId: z.uuid() }),
  body: changeStatusSchema,
  handler: async ({ actor, params, body, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await changeBookingStatus(ctx, params.bookingId, body) };
  },
});
