import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import {
  galleryRemoveQuerySchema,
  galleryUpdateSchema,
  removeFromGallery,
  updateGalleryItem,
} from "@/modules/media";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

const params = z.object({ salonId: z.uuid(), galleryId: z.uuid() });

/** PATCH /api/v1/salons/:salonId/gallery/:galleryId — `{ caption }` */
export const PATCH = defineRoute({
  ...sessionAuth,
  name: "salons.gallery.update",
  auth: "session",
  params,
  body: galleryUpdateSchema,
  handler: async ({ actor, params, body, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await updateGalleryItem(ctx, params.galleryId, body) };
  },
});

/** DELETE /api/v1/salons/:salonId/gallery/:galleryId?deleteImage=true */
export const DELETE = defineRoute({
  ...sessionAuth,
  name: "salons.gallery.remove",
  auth: "session",
  params,
  query: galleryRemoveQuerySchema,
  handler: async ({ actor, params, query, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    await removeFromGallery(ctx, params.galleryId, { deleteImage: query.deleteImage === "true" });
    return { data: { id: params.galleryId, removed: true } };
  },
});
