import { defineRoute } from "@/lib/api/define-route";
import { getProfile, updateProfile, updateProfileSchema } from "@/modules/account";
import { sessionAuth, type Actor } from "@/modules/auth";

export const dynamic = "force-dynamic";

/** GET /api/v1/me — the signed-in user's profile and salon memberships. */
export const GET = defineRoute({
  ...sessionAuth,
  name: "me.get",
  auth: "session",
  handler: async ({ actor }) => {
    const user = actor as unknown as Actor;
    const profile = await getProfile(user.userId);
    return {
      data: {
        ...profile,
        platformRole: user.platformRole,
        memberships: user.memberships,
      },
    };
  },
});

/** PATCH /api/v1/me — update the signed-in user's own profile. */
export const PATCH = defineRoute({
  ...sessionAuth,
  name: "me.update",
  auth: "session",
  body: updateProfileSchema,
  handler: async ({ actor, body }) => ({
    data: await updateProfile((actor as unknown as Actor).userId, body),
  }),
});
