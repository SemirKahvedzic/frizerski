import { defineRoute } from "@/lib/api/define-route";
import { requestMeta } from "@/lib/api/request-meta";
import { sessionAuth, type Actor } from "@/modules/auth";
import { createSalon, createSalonSchema, listSalonsForActor } from "@/modules/salons";

export const dynamic = "force-dynamic";

/** POST /api/v1/salons — open a new salon; the caller becomes OWNER. */
export const POST = defineRoute({
  ...sessionAuth,
  name: "salons.create",
  auth: "session",
  body: createSalonSchema,
  rateLimit: { limit: 5, windowSeconds: 3600, keyBy: "user" },
  handler: async ({ actor, body, request, requestId }) => {
    const salon = await createSalon(
      actor as unknown as Actor,
      body,
      requestMeta(request, requestId),
    );
    return { data: salon, status: 201 };
  },
});

/** GET /api/v1/salons — salons the caller belongs to, with role. */
export const GET = defineRoute({
  ...sessionAuth,
  name: "salons.listMine",
  auth: "session",
  handler: async ({ actor }) => ({ data: await listSalonsForActor(actor as unknown as Actor) }),
});
