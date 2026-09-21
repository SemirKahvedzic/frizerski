import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnectPrisma, prisma } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth/types";
import {
  addClosure,
  createSalon,
  defaultWorkingHours,
  getPublicSalon,
  getSalonSettings,
  getWorkingHours,
  listClosures,
  removeClosure,
  setWorkingHours,
  updateSalonProfile,
  updateSalonSettings,
} from "@/modules/salons";
import { resolveTenantContext, type TenantContext } from "@/modules/tenant";

const PREFIX = "mgmt-test";

async function makeActor(label: string, memberships: Actor["memberships"] = []): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@mgmt.local`,
      name: label,
      emailVerified: true,
    },
  });
  return {
    kind: "user",
    userId: user.id,
    email: user.email,
    name: user.name,
    emailVerified: true,
    isActive: true,
    locale: "bs",
    platformRole: null,
    memberships,
  };
}

const baseInput = {
  audience: "UNISEX" as const,
  timezone: "Europe/Sarajevo",
  currency: "BAM",
  defaultLocale: "bs" as const,
};

describe("salon management", () => {
  let owner: Actor;
  let ctx: TenantContext;
  let slug: string;

  beforeAll(async () => {
    await prisma.salon.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@mgmt.local" } } });
    owner = await makeActor("owner");
    const salon = await createSalon(owner, { ...baseInput, name: `${PREFIX} Salon` });
    slug = salon.slug;
    owner = { ...owner, memberships: [{ salonId: salon.id, role: "OWNER", employeeId: null }] };
    ctx = await resolveTenantContext(owner, { id: salon.id }, { requestId: "req-mgmt" });
  });

  afterAll(async () => {
    await prisma.salon.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@mgmt.local" } } });
    await disconnectPrisma();
  });

  it("creates settings and default opening hours together with the salon", async () => {
    const settings = await getSalonSettings(ctx);
    expect(settings).toMatchObject({
      slotIntervalMinutes: 30,
      cancellationCutoffHours: 12,
      timezone: "Europe/Sarajevo",
    });
    const hours = await getWorkingHours(ctx);
    expect(hours).toEqual(defaultWorkingHours());
  });

  it("updates the profile and audits only the changed fields", async () => {
    const updated = await updateSalonProfile(ctx, {
      name: `${PREFIX} Salon`,
      description: "Novi opis",
      category: "barbershop",
      audience: "MALE",
      address: "Ferhadija 1",
      city: "Sarajevo",
      postalCode: null,
      country: "BA",
      phone: "+387 33 000 000",
      email: null,
      website: null,
      instagram: null,
      facebook: null,
      tiktok: null,
      googleMapsUrl: null,
      brandColor: null,
      defaultLocale: "bs",
    });
    expect(updated.description).toBe("Novi opis");
    expect(updated.audience).toBe("MALE");

    const audit = await prisma.auditLog.findFirst({
      where: { salonId: ctx.salonId, action: "salon.profileUpdated" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.requestId).toBe("req-mgmt");
    const after = audit?.after as Record<string, unknown>;
    expect(Object.keys(after).sort()).toEqual([
      "address",
      "audience",
      "category",
      "city",
      "country",
      "description",
      "phone",
    ]);
    expect((audit?.before as Record<string, unknown>)["description"]).toBeNull();
  });

  it("updates settings including salon time zone and currency", async () => {
    const settings = await updateSalonSettings(ctx, {
      slotIntervalMinutes: 15,
      minBookingNoticeMinutes: 120,
      maxBookingAdvanceDays: 30,
      cancellationCutoffHours: 24,
      rescheduleCutoffHours: 24,
      bufferMinutes: 5,
      autoConfirmBookings: false,
      allowAnyEmployee: true,
      allowGuestBooking: false,
      requirePhone: true,
      emailNotificationsEnabled: true,
      pushNotificationsEnabled: false,
      notifyAdminsOnNewBooking: true,
      notifyEmployeeOnNewBooking: false,
      reminder24hEnabled: true,
      reminder1hEnabled: false,
      timezone: "Europe/Zagreb",
      currency: "EUR",
    });
    expect(settings.slotIntervalMinutes).toBe(15);
    expect(settings.timezone).toBe("Europe/Zagreb");
    expect((await prisma.salon.findUniqueOrThrow({ where: { id: ctx.salonId } })).currency).toBe(
      "EUR",
    );
    expect(
      await prisma.auditLog.count({
        where: { salonId: ctx.salonId, action: "salon.settingsUpdated" },
      }),
    ).toBe(1);
  });

  it("replaces opening hours and manages closures", async () => {
    const days = defaultWorkingHours().map((d) => (d.weekday === 2 ? { ...d, isClosed: true } : d));
    await setWorkingHours(ctx, days);
    const hours = await getWorkingHours(ctx);
    expect(hours.find((h) => h.weekday === 2)?.isClosed).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { salonId: ctx.salonId, action: "salon.workingHoursUpdated" },
      }),
    ).toBe(1);

    const closure = await addClosure(ctx, {
      startsOn: "2027-01-01",
      endsOn: "2027-01-02",
      reason: "Nova godina",
    });
    expect(closure).toMatchObject({
      startsOn: "2027-01-01",
      endsOn: "2027-01-02",
      reason: "Nova godina",
    });
    expect((await listClosures(ctx, { from: "2027-01-02" })).map((c) => c.id)).toContain(
      closure.id,
    );
    expect((await listClosures(ctx, { from: "2027-01-03" })).map((c) => c.id)).not.toContain(
      closure.id,
    );

    await removeClosure(ctx, closure.id);
    expect(await listClosures(ctx)).toHaveLength(0);
    await expect(removeClosure(ctx, closure.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("exposes only ACTIVE salons publicly with hours, closures and booking rules", async () => {
    const closure = await addClosure(ctx, {
      startsOn: "2027-06-01",
      endsOn: "2027-06-03",
      reason: null,
    });
    const pub = await getPublicSalon(slug, "2027-05-01");
    expect(pub).not.toBeNull();
    expect(pub?.description).toBe("Novi opis");
    expect(pub?.workingHours).toHaveLength(7);
    expect(pub?.closures.map((c) => c.id)).toEqual([closure.id]);
    expect(pub?.booking).toEqual({
      allowGuestBooking: false,
      cancellationCutoffHours: 24,
      maxBookingAdvanceDays: 30,
    });
    expect(pub && "settings" in pub).toBe(false);

    expect((await getPublicSalon(slug, "2027-07-01"))?.closures).toHaveLength(0);

    await prisma.salon.update({ where: { id: ctx.salonId }, data: { status: "INACTIVE" } });
    expect(await getPublicSalon(slug, "2027-05-01")).toBeNull();
    await prisma.salon.update({ where: { id: ctx.salonId }, data: { status: "ACTIVE" } });
  });

  it("keeps hours and closures isolated per salon and enforces permissions", async () => {
    const other = await makeActor("other");
    const otherSalon = await createSalon(other, { ...baseInput, name: `${PREFIX} Other` });
    const otherActor = {
      ...other,
      memberships: [{ salonId: otherSalon.id, role: "OWNER" as const, employeeId: null }],
    };
    const otherCtx = await resolveTenantContext(otherActor, { id: otherSalon.id });

    expect(await listClosures(otherCtx)).toHaveLength(0);
    expect((await getWorkingHours(otherCtx)).find((h) => h.weekday === 2)?.isClosed).toBe(false);

    const employee = await makeActor("employee", [
      { salonId: ctx.salonId, role: "EMPLOYEE", employeeId: null },
    ]);
    const employeeCtx = await resolveTenantContext(employee, { id: ctx.salonId });
    await expect(setWorkingHours(employeeCtx, defaultWorkingHours())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      addClosure(employeeCtx, { startsOn: "2027-01-01", endsOn: "2027-01-01" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
