import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { cancelBooking, cancelSchema } from "@/modules/booking";

export const dynamic = "force-dynamic";

export const POST = defineRoute({
  name: "bookings.manage.cancel",
  auth: "none",
  params: z.object({ token: z.string().min(20).max(200) }),
  body: cancelSchema,
  rateLimit: { limit: 30, windowSeconds: 60 },
  handler: async ({ params, body }) => ({
    data: await cancelBooking({ kind: "guest", token: params.token }, null, body),
  }),
});
