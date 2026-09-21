import type { PrismaClient } from "@/generated/prisma/client";
import type { SalonRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { isPlatformAdmin } from "@/modules/auth/permissions";
import type { Actor, Principal } from "@/modules/auth/types";
import { tenantDb, type TenantDb } from "@/modules/tenant/prisma-tenant";

/**
 * Explicit tenant context passed to every salon-scoped service function
 * (docs/architecture.md §6, layer 1). There is no ambient "current salon".
 */
export type TenantContext = {
  salonId: string;
  salonSlug: string;
  actor: Actor;
  /** Membership role, or `PLATFORM` when a super admin acts without membership. */
  role: SalonRole | "PLATFORM";
  db: TenantDb;
  request?: RequestMeta;
};

export type RequestMeta = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

/** Cross-tenant context for super admins; every use is audited by the caller. */
export type PlatformContext = {
  actor: Actor;
  db: PrismaClient;
  request?: RequestMeta;
};

type SalonRef = { id: string } | { slug: string };

/**
 * Resolves a tenant context for an actor. Non-members get 404 (not 403) so
 * the existence of a salon is never leaked. Suspended salons are only
 * reachable by platform admins.
 */
export async function resolveTenantContext(
  principal: Principal,
  ref: SalonRef,
  request?: RequestMeta,
): Promise<TenantContext> {
  if (principal.kind === "anonymous") {
    throw new UnauthenticatedError();
  }

  const salon = await prisma.salon.findUnique({
    where: "id" in ref ? { id: ref.id } : { slug: ref.slug },
    select: { id: true, slug: true, status: true },
  });
  if (!salon) {
    throw new NotFoundError("Salon");
  }

  const membership = principal.memberships.find((m) => m.salonId === salon.id);
  const platformAdmin = isPlatformAdmin(principal);

  if (!membership && !platformAdmin) {
    throw new NotFoundError("Salon");
  }
  if (!principal.isActive) {
    throw new ForbiddenError();
  }
  if (salon.status === "SUSPENDED" && !platformAdmin) {
    throw new ForbiddenError("This salon is suspended.");
  }

  return {
    salonId: salon.id,
    salonSlug: salon.slug,
    actor: principal,
    role: membership?.role ?? "PLATFORM",
    db: tenantDb(salon.id),
    request,
  };
}

export function platformContext(principal: Principal, request?: RequestMeta): PlatformContext {
  if (principal.kind === "anonymous") {
    throw new UnauthenticatedError();
  }
  if (!isPlatformAdmin(principal)) {
    throw new ForbiddenError();
  }
  return { actor: principal, db: prisma, request };
}
