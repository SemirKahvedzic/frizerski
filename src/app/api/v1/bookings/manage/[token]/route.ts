import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { getBookingByToken } from "@/modules/booking";

export const dynamic = "force-dynamic";

/** GET /api/v1/bookings/manage/:token — guest view with policy flags. */
export const GET = defineRoute({
  name: "bookings.manage.get",
  auth: "none",
  params: z.object({ token: z.string().min(20).max(200) }),
  rateLimit: { limit: 30, windowSeconds: 60 },
  handler: async ({ params }) => ({ data: await getBookingByToken(params.token) }),
});
