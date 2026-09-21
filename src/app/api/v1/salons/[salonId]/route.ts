import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { getSalon } from "@/modules/salons";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

/** GET /api/v1/salons/:salonId — salon details for a member (or platform admin). */
export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.get",
  auth: "session",
  params: z.object({ salonId: z.uuid() }),
  handler: async ({ actor, params, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    const salon = await getSalon(ctx);
    return { data: { ...salon, role: ctx.role } };
  },
});
