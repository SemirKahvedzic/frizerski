import { defineRoute } from "@/lib/api/define-route";
import { sessionAuth, type Actor } from "@/modules/auth";
import { platformStats } from "@/modules/platform";
import { platformContext } from "@/modules/tenant";

export const dynamic = "force-dynamic";

/** GET /api/v1/platform/stats — platform-wide counters (SUPER_ADMIN). */
export const GET = defineRoute({
  ...sessionAuth,
  name: "platform.stats",
  auth: "session",
  handler: async ({ actor }) => ({
    data: await platformStats(platformContext(actor as unknown as Actor)),
  }),
});
