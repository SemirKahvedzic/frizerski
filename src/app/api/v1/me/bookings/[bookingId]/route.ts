import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { sessionAuth, type Actor } from "@/modules/auth";
import { getBookingForUser } from "@/modules/booking";

export const dynamic = "force-dynamic";

export const GET = defineRoute({
  ...sessionAuth,
  name: "me.bookings.get",
  auth: "session",
  params: z.object({ bookingId: z.uuid() }),
  handler: async ({ actor, params }) => ({
    data: await getBookingForUser((actor as unknown as Actor).userId, params.bookingId),
  }),
});
