export { AUTH_COOKIE_PREFIX, createAuth, getAuth, resetAuth, type Auth } from "@/modules/auth/auth";
export { authorize, requireUser, requireVerifiedEmail } from "@/modules/auth/authorize";
export {
  PERMISSIONS,
  SALON_ROLE_PERMISSIONS,
  can,
  isPlatformAdmin,
  roleFor,
  type Permission,
  type PermissionScope,
} from "@/modules/auth/permissions";
export { sessionAuth } from "@/modules/auth/route";
export * from "@/modules/auth/schemas";
export {
  getCurrentActor,
  getCurrentPrincipal,
  resolveActorFromHeaders,
  resolveActorFromRequest,
  toActor,
} from "@/modules/auth/session";
export {
  ANONYMOUS,
  type Actor,
  type AnonymousActor,
  type Membership,
  type Principal,
} from "@/modules/auth/types";
