import { env } from "@/lib/env";
import {
  DisabledPushProvider,
  FakePushProvider,
} from "@/modules/notifications/push/providers/memory";
import { WebPushProvider } from "@/modules/notifications/push/providers/webpush";
import type { PushProvider } from "@/modules/notifications/push/types";

const globalForPush = globalThis as unknown as { __pushProvider?: PushProvider };

function createFromEnv(): PushProvider {
  switch (env.PUSH_PROVIDER) {
    case "webpush":
      return new WebPushProvider({
        publicKey: env.VAPID_PUBLIC_KEY ?? "",
        privateKey: env.VAPID_PRIVATE_KEY ?? "",
        subject: env.VAPID_SUBJECT ?? "",
      });
    case "fake":
      return new FakePushProvider();
    case "off":
      return new DisabledPushProvider();
  }
}

export function getPushProvider(): PushProvider {
  if (!globalForPush.__pushProvider) globalForPush.__pushProvider = createFromEnv();
  return globalForPush.__pushProvider;
}

export function setPushProvider(provider: PushProvider | undefined): void {
  globalForPush.__pushProvider = provider;
}

/** Whether browsers can subscribe: a real or fake provider with a public key to hand out. */
export function pushPublicConfig(): { enabled: boolean; publicKey: string | null } {
  if (env.PUSH_PROVIDER === "off") return { enabled: false, publicKey: null };
  // Browsers can only subscribe with a public key, whatever the provider.
  const publicKey = env.VAPID_PUBLIC_KEY ?? null;
  return { enabled: Boolean(publicKey), publicKey };
}

export { DisabledPushProvider, FakePushProvider, WebPushProvider };
export type * from "@/modules/notifications/push/types";
