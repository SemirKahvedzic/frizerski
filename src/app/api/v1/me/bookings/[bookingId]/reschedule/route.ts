import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { sessionAuth, type Actor } from "@/modules/auth";
import { rescheduleBooking, rescheduleSchema } from "@/modules/booking";

export const dynamic = "force-dynamic";

export const POST = defineRoute({
  ...sessionAuth,
  name: "me.bookings.reschedule",
  auth: "session",
  params: z.object({ bookingId: z.uuid() }),
  body: rescheduleSchema,
  handler: async ({ actor, params, body }) => ({
    data: await rescheduleBooking(
      { kind: "client", userId: (actor as unknown as Actor).userId },
      params.bookingId,
      body,
    ),
  }),
});
