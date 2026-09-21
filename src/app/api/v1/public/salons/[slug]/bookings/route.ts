import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { env } from "@/lib/env";
import { sessionAuth, type Actor } from "@/modules/auth";
import { ANONYMOUS } from "@/modules/auth/types";
import { createPublicBooking, createPublicBookingSchema } from "@/modules/booking";

export const dynamic = "force-dynamic";

/** POST /api/v1/public/salons/:slug/bookings — guest or signed-in booking. */
export const POST = defineRoute({
  ...sessionAuth,
  name: "public.bookings.create",
  auth: "optional",
  params: z.object({ slug: z.string().min(1) }),
  body: createPublicBookingSchema,
  rateLimit: { limit: 20, windowSeconds: 60 },
  handler: async ({ actor, params, body, request, requestId }) => {
    const principal = actor.kind === "user" ? (actor as unknown as Actor) : ANONYMOUS;
    const result = await createPublicBooking(
      params.slug,
      body,
      principal,
      requestMeta(request, requestId),
    );
    const locale = body.locale ?? "bs";
    return {
      status: 201,
      data: {
        ...result.booking,
        manageUrl: result.manageToken ? `${env.APP_URL}/${locale}/b/${result.manageToken}` : null,
      },
    };
  },
});
