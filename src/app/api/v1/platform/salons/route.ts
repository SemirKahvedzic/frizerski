import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { paginationQuerySchema } from "@/lib/api/pagination";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { listSalons } from "@/modules/platform";
import { salonStatusSchema } from "@/modules/salons";
import { platformContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

/** GET /api/v1/platform/salons — all salons (SUPER_ADMIN). */
export const GET = defineRoute({
  ...sessionAuth,
  name: "platform.salons.list",
  auth: "session",
  query: paginationQuerySchema.extend({
    q: z.string().trim().min(1).max(80).optional(),
    status: salonStatusSchema.optional(),
  }),
  handler: async ({ actor, query, request, requestId }) => {
    const ctx = platformContext(actor as unknown as Actor, requestMeta(request, requestId));
    const page = await listSalons(ctx, query);
    return { data: page.items, meta: { nextCursor: page.nextCursor } };
  },
});
