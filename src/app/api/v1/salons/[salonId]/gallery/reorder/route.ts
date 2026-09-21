import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { galleryReorderSchema, reorderGallery } from "@/modules/media";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

/** PUT /api/v1/salons/:salonId/gallery/reorder — `{ ids }` in the new order. */
export const PUT = defineRoute({
  ...sessionAuth,
  name: "salons.gallery.reorder",
  auth: "session",
  params: z.object({ salonId: z.uuid() }),
  body: galleryReorderSchema,
  handler: async ({ actor, params, body, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await reorderGallery(ctx, body.ids) };
  },
});
