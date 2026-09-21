import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { deleteImage, getImage } from "@/modules/media";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

const params = z.object({ salonId: z.uuid(), imageId: z.uuid() });

export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.images.get",
  auth: "session",
  params,
  handler: async ({ actor, params, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await getImage(ctx, params.imageId) };
  },
});

/** DELETE /api/v1/salons/:salonId/images/:imageId — removes references and stored objects. */
export const DELETE = defineRoute({
  ...sessionAuth,
  name: "salons.images.delete",
  auth: "session",
  params,
  handler: async ({ actor, params, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    await deleteImage(ctx, params.imageId);
    return { data: { id: params.imageId, deleted: true } };
  },
});
