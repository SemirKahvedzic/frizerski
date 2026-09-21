import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { NotFoundError } from "@/lib/errors";
import { getPublicSalon } from "@/modules/salons";

export const dynamic = "force-dynamic";

/** GET /api/v1/public/salons/:slug — public profile of an ACTIVE salon. */
export const GET = defineRoute({
  name: "public.salons.get",
  auth: "none",
  params: z.object({ slug: z.string().min(1).max(80) }),
  rateLimit: { limit: 120, windowSeconds: 60 },
  handler: async ({ params }) => {
    const salon = await getPublicSalon(params.slug, new Date().toISOString().slice(0, 10));
    if (!salon) throw new NotFoundError("Salon");
    return {
      data: salon,
      // Public data: safe to cache briefly at the edge.
    };
  },
});
