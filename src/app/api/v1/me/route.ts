import { defineRoute } from "@/lib/api/define-route";
import { sessionAuth, type Actor } from "@/modules/auth";

export const dynamic = "force-dynamic";

/** GET /api/v1/me — the signed-in user's profile and salon memberships. */
export const GET = defineRoute({
  ...sessionAuth,
  name: "me.get",
  auth: "session",
  handler: async ({ actor }) => {
    const user = actor as unknown as Actor;
    return {
      data: {
        id: user.userId,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        locale: user.locale,
        platformRole: user.platformRole,
        memberships: user.memberships,
      },
    };
  },
});
