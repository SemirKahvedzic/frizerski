import { defineRoute } from "@/lib/api/define-route";
import { pushPublicConfig } from "@/modules/notifications";

export const dynamic = "force-dynamic";

/** GET /api/v1/push/vapid-public-key — public: whether push is on and the VAPID key to subscribe with. */
export const GET = defineRoute({
  name: "push.vapidPublicKey",
  auth: "none",
  handler: async () => ({ data: pushPublicConfig() }),
});
