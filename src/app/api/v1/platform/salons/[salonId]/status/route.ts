import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { setSalonStatus } from "@/modules/platform";
import { salonStatusSchema } from "@/modules/salons";
import { platformContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

/** PATCH /api/v1/platform/salons/:salonId/status — activate / deactivate / suspend. */
export const PATCH = defineRoute({
  ...sessionAuth,
  name: "platform.salons.setStatus",
  auth: "session",
  params: z.object({ salonId: z.uuid() }),
  body: z.object({ status: salonStatusSchema, reason: z.string().trim().max(500).optional() }),
  handler: async ({ actor, params, body, request, requestId }) => {
    const ctx = platformContext(actor as unknown as Actor, requestMeta(request, requestId));
    return { data: await setSalonStatus(ctx, params.salonId, body.status, body.reason) };
  },
});
