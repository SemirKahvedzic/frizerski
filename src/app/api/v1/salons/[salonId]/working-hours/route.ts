import { revalidateTag } from "next/cache";
import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { cacheTags } from "@/lib/cache/tags";
import { sessionAuth, type Actor } from "@/modules/auth";
import { getWorkingHours, setWorkingHours, workingHoursSchema } from "@/modules/salons";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

const params = z.object({ salonId: z.uuid() });

export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.workingHours.get",
  auth: "session",
  params,
  handler: async ({ actor, params, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await getWorkingHours(ctx) };
  },
});

/** PUT — replaces all seven days. */
export const PUT = defineRoute({
  ...sessionAuth,
  name: "salons.workingHours.set",
  auth: "session",
  params,
  body: z.object({ days: workingHoursSchema }),
  handler: async ({ actor, params, body, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    const days = await setWorkingHours(ctx, body.days);
    revalidateTag(cacheTags.publicSalon(ctx.salonSlug), "max");
    return { data: days };
  },
});
