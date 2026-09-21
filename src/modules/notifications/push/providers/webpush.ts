import webpush, { WebPushError } from "web-push";

import type {
  PushMessage,
  PushProvider,
  PushSendResult,
  PushSubscriptionRecord,
} from "@/modules/notifications/push/types";

export type WebPushOptions = { publicKey: string; privateKey: string; subject: string };

/** Web Push (RFC 8030 + VAPID) through the `web-push` library. */
export class WebPushProvider implements PushProvider {
  readonly name = "webpush";

  constructor(options: WebPushOptions) {
    if (!options.publicKey || !options.privateKey || !options.subject) {
      throw new Error(
        "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are required for PUSH_PROVIDER=webpush",
      );
    }
    webpush.setVapidDetails(options.subject, options.publicKey, options.privateKey);
  }

  async send(subscription: PushSubscriptionRecord, message: PushMessage): Promise<PushSendResult> {
    if (!subscription.p256dh || !subscription.auth) {
      return { ok: false, gone: true, error: "subscription has no encryption keys" };
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(message),
        {
          TTL: 60 * 60,
          urgency: "normal",
          topic: message.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, ""),
        },
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof WebPushError) {
        return {
          ok: false,
          gone: error.statusCode === 404 || error.statusCode === 410,
          error: `${error.statusCode}: ${error.body?.slice(0, 200) ?? error.message}`,
        };
      }
      return {
        ok: false,
        gone: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
