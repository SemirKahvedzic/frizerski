import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { prisma } from "@/lib/db";
import { sessionAuth, type Actor } from "@/modules/auth";
import { availabilityQuerySchema, engineInput, loadAvailabilityContext } from "@/modules/booking";
import { computeAvailableSlots } from "@/modules/booking/engine";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

/** GET /api/v1/salons/:salonId/availability — staff view; `ignoreNotice=true` shows slots inside the notice window. */
export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.availability",
  auth: "session",
  params: z.object({ salonId: z.uuid() }),
  query: availabilityQuerySchema.extend({
    ignoreNotice: z.enum(["true", "false"]).default("true"),
  }),
  handler: async ({ actor, params, query, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    const context = await loadAvailabilityContext(prisma, {
      salonId: ctx.salonId,
      serviceId: query.serviceId,
      employeeIds: query.employeeId === "any" ? undefined : [query.employeeId],
      fromDate: query.date,
      toDate: query.date,
    });
    const now = new Date();
    const slots = context.employees.flatMap((e) =>
      computeAvailableSlots(
        engineInput(context, e, query.date, now, { ignoreNotice: query.ignoreNotice === "true" }),
      ).map((s) => ({
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        employeeIds: [e.id],
      })),
    );
    return {
      data: {
        date: query.date,
        timezone: context.timezone,
        slots: slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      },
    };
  },
});
