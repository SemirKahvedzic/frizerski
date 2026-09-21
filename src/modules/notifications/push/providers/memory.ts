import type {
  PushMessage,
  PushProvider,
  PushSendResult,
  PushSubscriptionRecord,
} from "@/modules/notifications/push/types";

/** Records pushes in memory; endpoints containing `gone` are reported as expired. */
export class FakePushProvider implements PushProvider {
  readonly name = "fake";
  readonly sent: { subscription: PushSubscriptionRecord; message: PushMessage }[] = [];

  async send(subscription: PushSubscriptionRecord, message: PushMessage): Promise<PushSendResult> {
    if (subscription.endpoint.includes("gone")) {
      return { ok: false, gone: true, error: "410 Gone" };
    }
    this.sent.push({ subscription, message });
    return { ok: true };
  }

  reset(): void {
    this.sent.length = 0;
  }
}

/** Used when push is turned off: every send is reported as a soft failure. */
export class DisabledPushProvider implements PushProvider {
  readonly name = "off";

  async send(): Promise<PushSendResult> {
    return { ok: false, gone: false, error: "push provider disabled" };
  }
}
