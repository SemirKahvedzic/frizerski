import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { can, type Permission, type PermissionScope } from "@/modules/auth/permissions";
import type { Actor, Principal } from "@/modules/auth/types";

/**
 * Server-side permission gate. Throws 401 for anonymous callers and 403 for
 * authenticated callers without the permission. Returns the narrowed actor so
 * callers can use it without re-checking `kind`.
 */
export function authorize(
  actor: Principal,
  permission: Permission,
  scope: PermissionScope = {},
): Actor {
  if (actor.kind === "anonymous") {
    throw new UnauthenticatedError();
  }
  if (!can(actor, permission, scope)) {
    throw new ForbiddenError();
  }
  return actor;
}

/** Salon-side staff features require a verified email address. */
export function requireVerifiedEmail(actor: Actor): Actor {
  if (!actor.emailVerified) {
    throw new ForbiddenError("Please verify your email address first.");
  }
  return actor;
}

export function requireUser(actor: Principal): Actor {
  if (actor.kind === "anonymous") {
    throw new UnauthenticatedError();
  }
  return actor;
}
