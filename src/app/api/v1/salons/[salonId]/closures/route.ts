import { revalidateTag } from "next/cache";
import { z } from "zod";

import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { cacheTags } from "@/lib/cache/tags";
import { isValidDateString } from "@/lib/time";
import { sessionAuth, type Actor } from "@/modules/auth";
import { addClosure, createClosureSchema, listClosures } from "@/modules/salons";
import { resolveTenantContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

const params = z.object({ salonId: z.uuid() });

export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.closures.list",
  auth: "session",
  params,
  query: z.object({ from: z.string().refine(isValidDateString, "Invalid date").optional() }),
  handler: async ({ actor, params, query, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    return { data: await listClosures(ctx, { from: query.from }) };
  },
});

export const POST = defineRoute({
  ...sessionAuth,
  name: "salons.closures.add",
  auth: "session",
  params,
  body: createClosureSchema,
  handler: async ({ actor, params, body, request, requestId }) => {
    const ctx = await resolveTenantContext(
      actor as unknown as Actor,
      { id: params.salonId },
      requestMeta(request, requestId),
    );
    const closure = await addClosure(ctx, body);
    revalidateTag(cacheTags.publicSalon(ctx.salonSlug), "max");
    return { data: closure, status: 201 };
  },
});
