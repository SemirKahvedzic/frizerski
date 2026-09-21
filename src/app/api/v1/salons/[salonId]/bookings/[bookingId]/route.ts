import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { getBookingForSalon } from "@/modules/booking";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.bookings.get",
  auth: "session",
  params: z.object({ salonId: z.uuid(), bookingId: z.uuid() }),
  handler: async ({ actor, params, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await getBookingForSalon(ctx, params.bookingId) };
  },
});
