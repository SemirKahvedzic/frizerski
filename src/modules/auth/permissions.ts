import type { SalonRole } from "@/generated/prisma/enums";
import type { Principal } from "@/modules/auth/types";

/**
 * Static permission map (docs/architecture.md §7).
 *
 * Roles are enums; permissions are code. `can()` is pure so the UI may use it
 * to hide controls, while `authorize()` re-checks on the server for every call.
 */
export const PERMISSIONS = [
  // salon
  "salon.read",
  "salon.update",
  "salon.delete",
  "settings.update",
  "workingHours.update",
  // people
  "membership.read",
  "membership.manage",
  "membership.manageAdmins",
  "employee.manage",
  "customer.read",
  "customer.manage",
  // catalog & content
  "service.manage",
  "gallery.manage",
  // bookings
  "booking.readAll",
  "booking.readOwn",
  "booking.create",
  "booking.update",
  "booking.updateStatus",
  "booking.completeOwn",
  // insight
  "analytics.read",
  "audit.read",
  "notification.read",
  // platform
  "platform.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER: readonly Permission[] = [
  "salon.read",
  "salon.update",
  "salon.delete",
  "settings.update",
  "workingHours.update",
  "membership.read",
  "membership.manage",
  "membership.manageAdmins",
  "employee.manage",
  "customer.read",
  "customer.manage",
  "service.manage",
  "gallery.manage",
  "booking.readAll",
  "booking.create",
  "booking.update",
  "booking.updateStatus",
  "analytics.read",
  "audit.read",
  "notification.read",
];

const ADMIN: readonly Permission[] = OWNER.filter(
  (p) => p !== "salon.delete" && p !== "membership.manageAdmins",
);

const EMPLOYEE: readonly Permission[] = ["salon.read", "booking.readOwn", "booking.completeOwn"];

export const SALON_ROLE_PERMISSIONS: Record<SalonRole, ReadonlySet<Permission>> = {
  OWNER: new Set(OWNER),
  ADMIN: new Set(ADMIN),
  EMPLOYEE: new Set(EMPLOYEE),
};

/** Permissions every authenticated user has without any membership. */
const AUTHENTICATED: ReadonlySet<Permission> = new Set<Permission>(["salon.read"]);

/** Permissions anyone has, including anonymous visitors. */
const PUBLIC: ReadonlySet<Permission> = new Set<Permission>(["salon.read"]);

export type PermissionScope = { salonId?: string };

export function can(
  actor: Principal,
  permission: Permission,
  scope: PermissionScope = {},
): boolean {
  if (PUBLIC.has(permission)) return true;
  if (actor.kind === "anonymous") return false;
  if (!actor.isActive) return false;

  if (actor.platformRole === "SUPER_ADMIN") return true;
  if (permission === "platform.manage") return false;

  if (AUTHENTICATED.has(permission)) return true;

  if (!scope.salonId) return false;
  const membership = actor.memberships.find((m) => m.salonId === scope.salonId);
  if (!membership) return false;
  return SALON_ROLE_PERMISSIONS[membership.role].has(permission);
}

export function roleFor(actor: Principal, salonId: string): SalonRole | null {
  if (actor.kind === "anonymous") return null;
  return actor.memberships.find((m) => m.salonId === salonId)?.role ?? null;
}

export function isPlatformAdmin(actor: Principal): boolean {
  return actor.kind === "user" && actor.isActive && actor.platformRole === "SUPER_ADMIN";
}
