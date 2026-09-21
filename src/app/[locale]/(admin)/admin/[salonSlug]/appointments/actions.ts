"use server";

import { z } from "zod";

import { defineAuthedAction } from "@/modules/auth/action";
import { changeBookingStatus, changeStatusSchema } from "@/modules/booking";
import { resolveTenantContext } from "@/modules/tenant";

export const changeBookingStatusAction = defineAuthedAction({
  name: "bookings.status",
  schema: changeStatusSchema.extend({ salonSlug: z.string().min(1), bookingId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await resolveTenantContext(principal, { slug: input.salonSlug }, { requestId });
    const booking = await changeBookingStatus(ctx, input.bookingId, {
      status: input.status,
      reason: input.reason,
      version: input.version,
    });
    return { id: booking.id, status: booking.status, version: booking.version };
  },
});
