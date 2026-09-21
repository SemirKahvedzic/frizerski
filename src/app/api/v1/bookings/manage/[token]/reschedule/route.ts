import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { rescheduleBooking, rescheduleSchema } from "@/modules/booking";

export const dynamic = "force-dynamic";

export const POST = defineRoute({
  name: "bookings.manage.reschedule",
  auth: "none",
  params: z.object({ token: z.string().min(20).max(200) }),
  body: rescheduleSchema,
  rateLimit: { limit: 30, windowSeconds: 60 },
  handler: async ({ params, body }) => ({
    data: await rescheduleBooking({ kind: "guest", token: params.token }, null, body),
  }),
});
