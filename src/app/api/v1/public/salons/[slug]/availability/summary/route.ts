import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import {
  availabilitySummaryQuerySchema,
  daysWithSlots,
  loadAvailabilityContext,
} from "@/modules/booking";

export const dynamic = "force-dynamic";

/** GET …/availability/summary?serviceId&employeeId&month=YYYY-MM → per-day booleans for the date picker. */
export const GET = defineRoute({
  name: "public.availability.summary",
  auth: "none",
  params: z.object({ slug: z.string().min(1) }),
  query: availabilitySummaryQuerySchema,
  rateLimit: { limit: 60, windowSeconds: 60 },
  handler: async ({ params, query }) => {
    const salon = await prisma.salon.findFirst({
      where: { slug: params.slug, status: "ACTIVE" },
      select: { id: true, timezone: true },
    });
    if (!salon) throw new NotFoundError("Salon");
    const [y, m] = query.month.split("-").map(Number) as [number, number];
    const from = `${query.month}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const to = `${query.month}-${String(lastDay).padStart(2, "0")}`;
    const context = await loadAvailabilityContext(prisma, {
      salonId: salon.id,
      serviceId: query.serviceId,
      employeeIds: query.employeeId === "any" ? undefined : [query.employeeId],
      fromDate: from,
      toDate: to,
    });
    return {
      data: {
        month: query.month,
        timezone: salon.timezone,
        days: daysWithSlots(context, from, to, query.employeeId, new Date()),
      },
    };
  },
});
