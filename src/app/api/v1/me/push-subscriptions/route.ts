import { defineRoute } from "@/lib/api/define-route";
import { sessionAuth, type Actor } from "@/modules/auth";
import {
  listPushSubscriptions,
  pushSubscriptionInputSchema,
  pushUnsubscribeSchema,
  removePushSubscription,
  upsertPushSubscription,
} from "@/modules/notifications";

export const dynamic = "force-dynamic";

/** GET /api/v1/me/push-subscriptions — live subscriptions of the signed-in user. */
export const GET = defineRoute({
  ...sessionAuth,
  name: "me.pushSubscriptions.list",
  auth: "session",
  handler: async ({ actor }) => ({
    data: await listPushSubscriptions((actor as unknown as Actor).userId),
  }),
});

/** POST /api/v1/me/push-subscriptions — register this browser (PushSubscription.toJSON()). */
export const POST = defineRoute({
  ...sessionAuth,
  name: "me.pushSubscriptions.create",
  auth: "session",
  body: pushSubscriptionInputSchema,
  rateLimit: { limit: 30, windowSeconds: 60, keyBy: "user" },
  handler: async ({ actor, body, request }) => ({
    data: await upsertPushSubscription((actor as unknown as Actor).userId, {
      ...body,
      userAgent: body.userAgent ?? request.headers.get("user-agent")?.slice(0, 512) ?? undefined,
    }),
  }),
});

/** DELETE /api/v1/me/push-subscriptions — body `{ endpoint }`. */
export const DELETE = defineRoute({
  ...sessionAuth,
  name: "me.pushSubscriptions.delete",
  auth: "session",
  body: pushUnsubscribeSchema,
  handler: async ({ actor, body }) => ({
    data: {
      removed: await removePushSubscription((actor as unknown as Actor).userId, body.endpoint),
    },
  }),
});
