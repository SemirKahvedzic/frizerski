import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import {
  createAdminBooking,
  createAdminBookingSchema,
  listBookingsForSalon,
  listBookingsQuerySchema,
} from "@/modules/booking";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

const params = z.object({ salonId: z.uuid() });

/** GET /api/v1/salons/:salonId/bookings?from&to&employeeId&status&customerId (employees see only their own). */
export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.bookings.list",
  auth: "session",
  params,
  query: listBookingsQuerySchema,
  handler: async ({ actor, params, query, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await listBookingsForSalon(ctx, query) };
  },
});

/** POST /api/v1/salons/:salonId/bookings — staff-created booking (walk-in / phone). */
export const POST = defineRoute({
  ...sessionAuth,
  name: "salons.bookings.create",
  auth: "session",
  params,
  body: createAdminBookingSchema,
  handler: async ({ actor, params, body, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    const result = await createAdminBooking(ctx, body);
    return { data: result.booking, status: 201 };
  },
});
