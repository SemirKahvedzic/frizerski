import { z } from "zod";

import type { SalonStatus } from "@/generated/prisma/enums";
import { decodeCursor, toPage, type Page, type PaginationQuery } from "@/lib/api/pagination";
import { NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit";
import type { PlatformContext } from "@/modules/tenant/context";

/**
 * Super-admin operations. Every function takes a `PlatformContext`, which can
 * only be obtained by a `SUPER_ADMIN`, and every mutation is audited.
 */

export type PlatformSalonRow = {
  id: string;
  slug: string;
  name: string;
  status: SalonStatus;
  audience: "MALE" | "FEMALE" | "UNISEX";
  createdAt: Date;
  owners: { userId: string; email: string; name: string }[];
  memberCount: number;
};

const salonCursorSchema = z.object({ createdAt: z.string(), id: z.string() });

export type ListSalonsQuery = PaginationQuery & { q?: string; status?: SalonStatus };

export async function listSalons(
  ctx: PlatformContext,
  query: ListSalonsQuery,
): Promise<Page<PlatformSalonRow>> {
  const cursor = decodeCursor(query.cursor, salonCursorSchema);

  const rows = await ctx.db.salon.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { slug: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      audience: true,
      createdAt: true,
      _count: { select: { memberships: true } },
      memberships: {
        where: { role: "OWNER" },
        select: { user: { select: { id: true, email: true, name: true } } },
      },
    },
  });

  const mapped: PlatformSalonRow[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    audience: row.audience,
    createdAt: row.createdAt,
    owners: row.memberships.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
    })),
    memberCount: row._count.memberships,
  }));

  return toPage(mapped, query.limit, (row) => ({
    createdAt: row.createdAt.toISOString(),
    id: row.id,
  }));
}

export async function setSalonStatus(
  ctx: PlatformContext,
  salonId: string,
  status: SalonStatus,
  reason?: string,
): Promise<{ id: string; status: SalonStatus }> {
  const existing = await ctx.db.salon.findUnique({
    where: { id: salonId },
    select: { id: true, status: true },
  });
  if (!existing) throw new NotFoundError("Salon");
  if (existing.status === status) return existing;

  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.salon.update({
      where: { id: salonId },
      data: { status },
      select: { id: true, status: true },
    });
    await recordAudit(tx, {
      salonId,
      actor: ctx.actor,
      action: "salon.statusChanged",
      entityType: "Salon",
      entityId: salonId,
      before: { status: existing.status },
      after: { status },
      metadata: reason ? { reason } : undefined,
      request: ctx.request,
    });
    return updated;
  });
}

export type PlatformStats = {
  salons: Record<SalonStatus, number>;
  users: number;
  activeUsers: number;
};

export async function platformStats(ctx: PlatformContext): Promise<PlatformStats> {
  const [grouped, users, activeUsers] = await Promise.all([
    ctx.db.salon.groupBy({ by: ["status"], _count: { _all: true } }),
    ctx.db.user.count(),
    ctx.db.user.count({ where: { isActive: true } }),
  ]);
  const salons: Record<SalonStatus, number> = { ACTIVE: 0, INACTIVE: 0, SUSPENDED: 0 };
  for (const row of grouped) {
    salons[row.status] = row._count._all;
  }
  return { salons, users, activeUsers };
}

export async function setUserActive(
  ctx: PlatformContext,
  userId: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  const existing = await ctx.db.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });
  if (!existing) throw new NotFoundError("User");
  if (existing.isActive === isActive) return existing;

  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, isActive: true },
    });
    if (!isActive) {
      // Deactivation signs the user out everywhere immediately.
      await tx.session.deleteMany({ where: { userId } });
    }
    await recordAudit(tx, {
      salonId: null,
      actor: ctx.actor,
      action: isActive ? "user.activated" : "user.deactivated",
      entityType: "User",
      entityId: userId,
      before: { isActive: existing.isActive },
      after: { isActive },
      request: ctx.request,
    });
    return updated;
  });
}
