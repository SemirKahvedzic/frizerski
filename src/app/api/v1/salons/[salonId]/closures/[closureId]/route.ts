import { revalidateTag } from "next/cache";
import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { noContent } from "@/lib/api/response";
import { cacheTags } from "@/lib/cache/tags";
import { sessionAuth, type Actor } from "@/modules/auth";
import { removeClosure } from "@/modules/salons";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

export const DELETE = defineRoute({
  ...sessionAuth,
  name: "salons.closures.remove",
  auth: "session",
  params: z.object({ salonId: z.uuid(), closureId: z.uuid() }),
  handler: async ({ actor, params, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    await removeClosure(ctx, params.closureId);
    revalidateTag(cacheTags.publicSalon(ctx.salonSlug), "max");
    return noContent();
  },
});
