import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnectPrisma, prisma } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { ANONYMOUS, type Actor } from "@/modules/auth/types";
import { listSalons, platformStats, setSalonStatus, setUserActive } from "@/modules/platform";
import { createSalon, listSalonsForActor } from "@/modules/salons";
import { platformContext, resolveTenantContext, tenantDb } from "@/modules/tenant";
import { TenantScopeError } from "@/modules/tenant/scope";

const PREFIX = "tenant-test";

async function makeUser(
  label: string,
  extra: Partial<{ platformRole: "SUPER_ADMIN"; emailVerified: boolean }> = {},
) {
  return prisma.user.create({
    data: {
      email: `${PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@tenant.local`,
      name: label,
      emailVerified: extra.emailVerified ?? true,
      platformRole: extra.platformRole ?? null,
    },
  });
}

async function actorFor(userId: string): Promise<Actor> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const memberships = await prisma.salonMembership.findMany({
    where: { userId },
    select: { salonId: true, role: true, employeeId: true },
  });
  return {
    kind: "user",
    userId: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    isActive: user.isActive,
    locale: user.locale,
    platformRole: user.platformRole,
    memberships,
  };
}

async function cleanup() {
  await prisma.salon.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@tenant.local" } } });
}

describe("multi-tenant isolation", () => {
  let salonA: { id: string; slug: string };
  let salonB: { id: string; slug: string };
  let ownerA: Actor;
  let ownerB: Actor;
  let memberA: string;
  let memberB: string;

  beforeAll(async () => {
    await cleanup();
    const [ua, ub] = await Promise.all([makeUser("owner-a"), makeUser("owner-b")]);
    salonA = await prisma.salon.create({
      data: { slug: `${PREFIX}-a-${Date.now()}`, name: "Salon A" },
    });
    salonB = await prisma.salon.create({
      data: { slug: `${PREFIX}-b-${Date.now()}`, name: "Salon B" },
    });
    memberA = (
      await prisma.salonMembership.create({
        data: { salonId: salonA.id, userId: ua.id, role: "OWNER" },
      })
    ).id;
    memberB = (
      await prisma.salonMembership.create({
        data: { salonId: salonB.id, userId: ub.id, role: "OWNER" },
      })
    ).id;
    ownerA = await actorFor(ua.id);
    ownerB = await actorFor(ub.id);
  });

  afterAll(async () => {
    await cleanup();
    await disconnectPrisma();
  });

  describe("tenant-scoped Prisma client", () => {
    it("only returns rows of its own salon", async () => {
      const rows = await tenantDb(salonA.id).salonMembership.findMany();
      expect(rows.map((r) => r.id)).toEqual([memberA]);
      expect(await tenantDb(salonA.id).salonMembership.count()).toBe(1);
    });

    it("cannot read another salon's row even by primary key", async () => {
      expect(
        await tenantDb(salonA.id).salonMembership.findUnique({ where: { id: memberB } }),
      ).toBeNull();
      expect(
        await tenantDb(salonA.id).salonMembership.findFirst({ where: { id: memberB } }),
      ).toBeNull();
    });

    it("cannot update or delete another salon's row", async () => {
      await expect(
        tenantDb(salonA.id).salonMembership.update({
          where: { id: memberB },
          data: { role: "ADMIN" },
        }),
      ).rejects.toThrow();
      const untouched = await prisma.salonMembership.findUniqueOrThrow({ where: { id: memberB } });
      expect(untouched.role).toBe("OWNER");

      const deleted = await tenantDb(salonA.id).salonMembership.deleteMany({
        where: { id: memberB },
      });
      expect(deleted.count).toBe(0);
    });

    it("accepts its own salonId on create and rejects explicit foreign salonIds", async () => {
      const extra = await makeUser("extra");
      // Repositories always pass salonId explicitly; the extension verifies it matches the context.
      const created = await tenantDb(salonA.id).salonMembership.create({
        data: { userId: extra.id, role: "EMPLOYEE", salonId: salonA.id },
      });
      expect(created.salonId).toBe(salonA.id);

      await expect(
        tenantDb(salonA.id).salonMembership.create({
          data: { userId: extra.id, role: "EMPLOYEE", salonId: salonB.id },
        }),
      ).rejects.toBeInstanceOf(TenantScopeError);
      await expect(
        tenantDb(salonA.id).salonMembership.findMany({ where: { salonId: salonB.id } }),
      ).rejects.toBeInstanceOf(TenantScopeError);
    });

    it("pins the Salon root to its own id and refuses non-tenant models", async () => {
      const own = await tenantDb(salonA.id).salon.findFirst();
      expect(own?.id).toBe(salonA.id);
      await expect(
        tenantDb(salonA.id).salon.findUnique({ where: { id: salonB.id } }),
      ).rejects.toBeInstanceOf(TenantScopeError);
      await expect(
        tenantDb(salonA.id).salon.delete({ where: { id: salonA.id } }),
      ).rejects.toBeInstanceOf(TenantScopeError);
      await expect(tenantDb(salonA.id).user.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    });

    it("keeps the raw client unaffected", async () => {
      const all = await prisma.salonMembership.findMany({
        where: { salonId: { in: [salonA.id, salonB.id] } },
      });
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("resolveTenantContext", () => {
    it("resolves members by id or slug with their role", async () => {
      const byId = await resolveTenantContext(ownerA, { id: salonA.id });
      expect(byId.role).toBe("OWNER");
      expect(byId.salonSlug).toBe(salonA.slug);
      const bySlug = await resolveTenantContext(ownerA, { slug: salonA.slug });
      expect(bySlug.salonId).toBe(salonA.id);
    });

    it("hides other salons behind 404 and rejects anonymous callers", async () => {
      await expect(resolveTenantContext(ownerA, { id: salonB.id })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(resolveTenantContext(ownerA, { slug: "does-not-exist" })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(resolveTenantContext(ANONYMOUS, { id: salonA.id })).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    });

    it("lets platform admins into any salon, and blocks owners of suspended salons", async () => {
      const admin = await actorFor((await makeUser("admin", { platformRole: "SUPER_ADMIN" })).id);
      const ctx = await resolveTenantContext(admin, { id: salonB.id });
      expect(ctx.role).toBe("PLATFORM");

      await prisma.salon.update({ where: { id: salonB.id }, data: { status: "SUSPENDED" } });
      await expect(resolveTenantContext(ownerB, { id: salonB.id })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect((await resolveTenantContext(admin, { id: salonB.id })).salonId).toBe(salonB.id);
      await prisma.salon.update({ where: { id: salonB.id }, data: { status: "ACTIVE" } });
    });
  });

  describe("salon service", () => {
    it("creates a salon with the creator as OWNER and writes an audit row", async () => {
      const user = await makeUser("creator");
      const actor = await actorFor(user.id);
      const salon = await createSalon(actor, {
        name: `${PREFIX} Novi Salon Đ`,
        audience: "FEMALE",
        timezone: "Europe/Sarajevo",
        currency: "BAM",
        defaultLocale: "bs",
      });
      expect(salon.slug).toBe(`${PREFIX}-novi-salon-dj`);
      expect(salon.audience).toBe("FEMALE");

      const membership = await prisma.salonMembership.findUnique({
        where: { userId_salonId: { userId: user.id, salonId: salon.id } },
      });
      expect(membership?.role).toBe("OWNER");

      const audit = await prisma.auditLog.findFirst({
        where: { entityId: salon.id, action: "salon.created" },
      });
      expect(audit).toMatchObject({ salonId: salon.id, actorUserId: user.id, actorType: "USER" });

      const mine = await listSalonsForActor(await actorFor(user.id));
      expect(mine.map((s) => s.id)).toContain(salon.id);
      expect(mine[0]?.role).toBe("OWNER");
    });

    it("de-duplicates generated slugs and rejects taken explicit slugs", async () => {
      const actor = await actorFor((await makeUser("dupe")).id);
      const first = await createSalon(actor, {
        name: `${PREFIX} Dupe`,
        audience: "UNISEX",
        timezone: "Europe/Sarajevo",
        currency: "BAM",
        defaultLocale: "bs",
      });
      const second = await createSalon(actor, {
        name: `${PREFIX} Dupe`,
        audience: "UNISEX",
        timezone: "Europe/Sarajevo",
        currency: "BAM",
        defaultLocale: "bs",
      });
      expect(second.slug).toBe(`${first.slug}-2`);

      await expect(
        createSalon(actor, {
          name: "X",
          slug: first.slug,
          audience: "UNISEX",
          timezone: "Europe/Sarajevo",
          currency: "BAM",
          defaultLocale: "bs",
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("requires a verified email", async () => {
      const actor = await actorFor((await makeUser("unverified", { emailVerified: false })).id);
      await expect(
        createSalon(actor, {
          name: `${PREFIX} Nope`,
          audience: "UNISEX",
          timezone: "Europe/Sarajevo",
          currency: "BAM",
          defaultLocale: "bs",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("platform service", () => {
    it("is reserved for super admins and lists salons with owners", async () => {
      expect(() => platformContext(ownerA)).toThrow(ForbiddenError);
      const admin = await actorFor((await makeUser("padmin", { platformRole: "SUPER_ADMIN" })).id);
      const ctx = platformContext(admin);

      const page = await listSalons(ctx, { limit: 100, q: PREFIX });
      const rowA = page.items.find((s) => s.id === salonA.id);
      expect(rowA?.owners.map((o) => o.email)).toEqual([ownerA.email]);

      const small = await listSalons(ctx, { limit: 1, q: PREFIX });
      expect(small.items).toHaveLength(1);
      expect(small.nextCursor).toBeTruthy();
      const next = await listSalons(ctx, {
        limit: 1,
        q: PREFIX,
        cursor: small.nextCursor ?? undefined,
      });
      expect(next.items[0]?.id).not.toBe(small.items[0]?.id);

      const stats = await platformStats(ctx);
      expect(stats.salons.ACTIVE).toBeGreaterThanOrEqual(2);
    });

    it("changes salon status with an audit trail and deactivates users with session revocation", async () => {
      const admin = await actorFor((await makeUser("padmin2", { platformRole: "SUPER_ADMIN" })).id);
      const ctx = platformContext(admin, { requestId: "req-test" });

      await setSalonStatus(ctx, salonA.id, "INACTIVE", "unpaid");
      expect((await prisma.salon.findUniqueOrThrow({ where: { id: salonA.id } })).status).toBe(
        "INACTIVE",
      );
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: salonA.id, action: "salon.statusChanged" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toMatchObject({
        before: { status: "ACTIVE" },
        after: { status: "INACTIVE" },
        requestId: "req-test",
      });
      await setSalonStatus(ctx, salonA.id, "ACTIVE");

      const victim = await makeUser("victim");
      await prisma.session.create({
        data: {
          userId: victim.id,
          token: `tok-${victim.id}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await setUserActive(ctx, victim.id, false);
      expect(await prisma.session.count({ where: { userId: victim.id } })).toBe(0);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).isActive).toBe(
        false,
      );
    });
  });
});
