import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { getPublicGallery } from "@/modules/media";

export const dynamic = "force-dynamic";

/** GET /api/v1/public/salons/:slug/gallery — ordered gallery with image variants. */
export const GET = defineRoute({
  name: "public.salons.gallery",
  auth: "none",
  params: z.object({ slug: z.string().min(1) }),
  rateLimit: { limit: 120, windowSeconds: 60 },
  handler: async ({ params }) => ({ data: await getPublicGallery(params.slug) }),
});
