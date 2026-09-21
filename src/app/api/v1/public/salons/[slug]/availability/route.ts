import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import {
  availabilityQuerySchema,
  loadAvailabilityContext,
  slotsForAnyEmployee,
  slotsForEmployee,
} from "@/modules/booking";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/public/salons/:slug/availability?serviceId&employeeId=<id>|any&date=YYYY-MM-DD
 * Slots are returned as UTC instants; clients render them in `timezone`.
 */
export const GET = defineRoute({
  name: "public.availability",
  auth: "none",
  params: z.object({ slug: z.string().min(1) }),
  query: availabilityQuerySchema,
  rateLimit: { limit: 120, windowSeconds: 60 },
  handler: async ({ params, query }) => {
    const salon = await prisma.salon.findFirst({
      where: { slug: params.slug, status: "ACTIVE" },
      select: { id: true, timezone: true },
    });
    if (!salon) throw new NotFoundError("Salon");
    const context = await loadAvailabilityContext(prisma, {
      salonId: salon.id,
      serviceId: query.serviceId,
      employeeIds: query.employeeId === "any" ? undefined : [query.employeeId],
      fromDate: query.date,
      toDate: query.date,
    });
    const now = new Date();
    const slots =
      query.employeeId === "any"
        ? slotsForAnyEmployee(context, query.date, now)
        : slotsForEmployee(context, query.employeeId, query.date, now).map((s) => ({
            ...s,
            employeeIds: [query.employeeId],
          }));
    return {
      data: {
        date: query.date,
        timezone: salon.timezone,
        slotIntervalMinutes: context.settings.slotIntervalMinutes,
        slots: slots.map((s) => ({
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          employeeIds: s.employeeIds,
        })),
      },
    };
  },
});
