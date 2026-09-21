import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { ValidationError } from "@/lib/errors";
import { sessionAuth, type Actor } from "@/modules/auth";
import {
  listImages,
  listImagesQuerySchema,
  uploadImage,
  uploadImageFieldsSchema,
} from "@/modules/media";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

const params = z.object({ salonId: z.uuid() });

/** GET /api/v1/salons/:salonId/images?purpose */
export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.images.list",
  auth: "session",
  params,
  query: listImagesQuerySchema,
  handler: async ({ actor, params, query, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await listImages(ctx, { purpose: query.purpose }) };
  },
});

/**
 * POST /api/v1/salons/:salonId/images — multipart: `file`, `purpose`, `altText?`.
 * Returns the stored image with its variants.
 */
export const POST = defineRoute({
  ...sessionAuth,
  name: "salons.images.upload",
  auth: "session",
  params,
  rateLimit: { limit: 60, windowSeconds: 60, keyBy: "user" },
  handler: async ({ actor, params, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ValidationError("Expected multipart/form-data.", { where: "body" });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("Missing file.", { where: "body", field: "file" });
    }
    const fields = uploadImageFieldsSchema.safeParse({
      purpose: form.get("purpose"),
      altText: form.get("altText") ?? undefined,
    });
    if (!fields.success) {
      throw new ValidationError("Invalid upload fields.", { where: "body", field: "purpose" });
    }
    const image = await uploadImage(ctx, {
      purpose: fields.data.purpose,
      fileName: file.name || "upload",
      buffer: Buffer.from(await file.arrayBuffer()),
      altText: fields.data.altText,
    });
    return { status: 201, data: image };
  },
});
