import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { addToGallery, galleryAddSchema, listGallery } from "@/modules/media";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

const params = z.object({ salonId: z.uuid() });

export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.gallery.list",
  auth: "session",
  params,
  handler: async ({ actor, params, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await listGallery(ctx) };
  },
});

/** POST /api/v1/salons/:salonId/gallery — `{ imageId, caption? }` appends a GALLERY image. */
export const POST = defineRoute({
  ...sessionAuth,
  name: "salons.gallery.add",
  auth: "session",
  params,
  body: galleryAddSchema,
  handler: async ({ actor, params, body, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { status: 201, data: await addToGallery(ctx, body) };
  },
});
