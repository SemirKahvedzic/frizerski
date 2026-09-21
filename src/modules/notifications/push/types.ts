/**
 * Push provider abstraction (docs/notifications.md §7). Web Push today;
 * FCM/APNs adapters are selected by `PushSubscription.platform` later.
 */
export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
};

export type PushMessage = {
  title: string;
  body: string;
  url: string;
  /** Same tag replaces an earlier notification for the same booking. */
  tag: string;
  data?: Record<string, unknown>;
};

export type PushSendResult = { ok: true } | { ok: false; gone: boolean; error: string };

export interface PushProvider {
  readonly name: string;
  send(subscription: PushSubscriptionRecord, message: PushMessage): Promise<PushSendResult>;
}
