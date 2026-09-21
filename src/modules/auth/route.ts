import { resolveActorFromRequest } from "@/modules/auth/session";

/**
 * Spread into `defineRoute` for authenticated routes:
 *
 *   defineRoute({ ...sessionAuth, auth: "session", name: "me", handler })
 */
export const sessionAuth = { resolveActor: resolveActorFromRequest } as const;
