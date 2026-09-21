import { revalidateTag } from "next/cache";
import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { cacheTags } from "@/lib/cache/tags";
import { sessionAuth, type Actor } from "@/modules/auth";
import { getSalonSettings, updateSalonSettings, updateSalonSettingsSchema } from "@/modules/salons";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

const params = z.object({ salonId: z.uuid() });

export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.settings.get",
  auth: "session",
  params,
  handler: async ({ actor, params, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await getSalonSettings(ctx) };
  },
});

export const PATCH = defineRoute({
  ...sessionAuth,
  name: "salons.settings.update",
  auth: "session",
  params,
  body: updateSalonSettingsSchema,
  handler: async ({ actor, params, body, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    const settings = await updateSalonSettings(ctx, body);
    revalidateTag(cacheTags.publicSalon(ctx.salonSlug), "max");
    return { data: settings };
  },
});
