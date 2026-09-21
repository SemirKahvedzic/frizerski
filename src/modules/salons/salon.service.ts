import { prisma } from "@/lib/db";
import { ConflictError } from "@/lib/errors";
import { slugify, uniqueSlug } from "@/lib/slug";
import { recordAudit } from "@/modules/audit";
import { requireUser, requireVerifiedEmail } from "@/modules/auth/authorize";
import type { Principal } from "@/modules/auth/types";
import type { CreateSalonInput } from "@/modules/salons/schemas";
import type { RequestMeta, TenantContext } from "@/modules/tenant/context";

export type SalonSummary = {
  id: string;
  slug: string;
  name: string;
  audience: "MALE" | "FEMALE" | "UNISEX";
  timezone: string;
  currency: string;
  defaultLocale: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  createdAt: Date;
};

const summarySelect = {
  id: true,
  slug: true,
  name: true,
  audience: true,
  timezone: true,
  currency: true,
  defaultLocale: true,
  status: true,
  createdAt: true,
} as const;

/**
 * Any signed-in user with a verified email can open a salon and becomes its
 * OWNER. Salon, membership and audit row are written in one transaction.
 */
export async function createSalon(
  principal: Principal,
  input: CreateSalonInput,
  request?: RequestMeta,
): Promise<SalonSummary> {
  const actor = requireVerifiedEmail(requireUser(principal));

  const requestedSlug = input.slug && input.slug.length > 0 ? input.slug : slugify(input.name);
  const slug = await uniqueSlug(requestedSlug, async (candidate) =>
    Boolean(await prisma.salon.findUnique({ where: { slug: candidate }, select: { id: true } })),
  );
  if (input.slug && slug !== input.slug) {
    throw new ConflictError("This address is already taken.", { field: "slug" });
  }

  return prisma.$transaction(async (tx) => {
    const salon = await tx.salon.create({
      data: {
        name: input.name,
        slug,
        audience: input.audience,
        timezone: input.timezone,
        currency: input.currency,
        defaultLocale: input.defaultLocale,
      },
      select: summarySelect,
    });

    await tx.salonMembership.create({
      data: { salonId: salon.id, userId: actor.userId, role: "OWNER" },
    });

    await recordAudit(tx, {
      salonId: salon.id,
      actor,
      action: "salon.created",
      entityType: "Salon",
      entityId: salon.id,
      after: {
        name: salon.name,
        slug: salon.slug,
        audience: salon.audience,
        timezone: salon.timezone,
      },
      request,
    });

    return salon;
  });
}

export type SalonWithRole = SalonSummary & { role: "OWNER" | "ADMIN" | "EMPLOYEE" };

/** Salons the actor belongs to, with their role. */
export async function listSalonsForActor(principal: Principal): Promise<SalonWithRole[]> {
  const actor = requireUser(principal);
  if (actor.memberships.length === 0) return [];

  const salons = await prisma.salon.findMany({
    where: { id: { in: actor.memberships.map((m) => m.salonId) } },
    select: summarySelect,
    orderBy: { createdAt: "asc" },
  });

  return salons.map((salon) => ({
    ...salon,
    role: actor.memberships.find((m) => m.salonId === salon.id)?.role ?? "EMPLOYEE",
  }));
}

/** The salon of the current tenant context (read through the scoped client). */
export async function getSalon(ctx: TenantContext): Promise<SalonSummary> {
  return ctx.db.salon.findUniqueOrThrow({ where: { id: ctx.salonId }, select: summarySelect });
}
