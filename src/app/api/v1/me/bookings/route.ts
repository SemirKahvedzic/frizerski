import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { sessionAuth, type Actor } from "@/modules/auth";
import { listBookingsForUser } from "@/modules/booking";

export const dynamic = "force-dynamic";

/** GET /api/v1/me/bookings?scope=upcoming|past|cancelled */
export const GET = defineRoute({
  ...sessionAuth,
  name: "me.bookings.list",
  auth: "session",
  query: z.object({ scope: z.enum(["upcoming", "past", "cancelled"]).default("upcoming") }),
  handler: async ({ actor, query }) => ({
    data: await listBookingsForUser((actor as unknown as Actor).userId, query.scope),
  }),
});
