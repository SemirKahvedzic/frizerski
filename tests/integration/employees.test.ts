import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnectPrisma, prisma } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth/types";
import {
  addBlockedTime,
  addTimeOff,
  createEmployee,
  deleteEmployee,
  getEmployee,
  getSchedule,
  inviteEmployeeUser,
  listBlockedTimes,
  listEmployees,
  listTimeOff,
  removeBlockedTime,
  setSchedule,
  updateEmployee,
} from "@/modules/employees";
import { FakeEmailProvider, setEmailProvider } from "@/modules/notifications";
import { createSalon, getPublicSalon } from "@/modules/salons";
import { resolveTenantContext, type TenantContext } from "@/modules/tenant";

const PREFIX = "emp-test";
const emails = new FakeEmailProvider();

async function makeActor(label: string, memberships: Actor["memberships"] = []): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@emp.local`,
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

const employeeInput = {
  firstName: "Marko",
  lastName: "Marić",
  position: "Senior",
  bio: null,
  email: null,
  phone: null,
  audience: "MALE" as const,
  color: "#2563eb",
  isActive: true,
  isBookableOnline: true,
};

describe("employees", () => {
  let ctx: TenantContext;
  let slug: string;

  beforeAll(async () => {
    setEmailProvider(emails);
    await prisma.salon.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@emp.local" } } });
    const owner = await makeActor("owner");
    const salon = await createSalon(owner, {
      name: `${PREFIX} Salon`,
      audience: "UNISEX",
      timezone: "Europe/Sarajevo",
      currency: "BAM",
      defaultLocale: "bs",
    });
    slug = salon.slug;
    ctx = await resolveTenantContext(
      { ...owner, memberships: [{ salonId: salon.id, role: "OWNER", employeeId: null }] },
      { id: salon.id },
    );
  });

  afterAll(async () => {
    await prisma.salon.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@emp.local" } } });
    setEmailProvider(undefined);
    await disconnectPrisma();
  });

  it("creates, updates, lists and orders employees with audit rows", async () => {
    const marko = await createEmployee(ctx, employeeInput);
    const ana = await createEmployee(ctx, {
      ...employeeInput,
      firstName: "Ana",
      lastName: "Anić",
      audience: "FEMALE",
    });
    expect(ana.sortOrder).toBe(marko.sortOrder + 1);

    await updateEmployee(ctx, ana.id, {
      ...employeeInput,
      firstName: "Ana",
      lastName: "Anić",
      audience: "FEMALE",
      isBookableOnline: false,
    });
    expect((await getEmployee(ctx, ana.id)).isBookableOnline).toBe(false);
    expect((await listEmployees(ctx)).map((e) => e.firstName)).toEqual(["Marko", "Ana"]);

    const actions = await prisma.auditLog.findMany({
      where: { salonId: ctx.salonId, entityType: "Employee" },
      select: { action: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual([
      "employee.created",
      "employee.created",
      "employee.updated",
    ]);
  });

  it("replaces the weekly schedule including breaks", async () => {
    const [marko] = await listEmployees(ctx);
    const blocks = await setSchedule(ctx, marko!.id, [
      {
        weekday: 0,
        startTime: "09:00",
        endTime: "17:00",
        breaks: [{ startTime: "13:00", endTime: "13:30", label: "Lunch" }],
      },
      { weekday: 3, startTime: "12:00", endTime: "20:00", breaks: [] },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.breaks[0]).toMatchObject({
      startTime: "13:00",
      endTime: "13:30",
      label: "Lunch",
    });

    await setSchedule(ctx, marko!.id, [
      { weekday: 1, startTime: "10:00", endTime: "16:00", breaks: [] },
    ]);
    const after = await getSchedule(ctx, marko!.id);
    expect(after.map((b) => b.weekday)).toEqual([1]);
    expect(await prisma.employeeBreak.count({ where: { salonId: ctx.salonId } })).toBe(0);
  });

  it("converts time off and blocked times from the salon time zone to UTC", async () => {
    const [marko] = await listEmployees(ctx);
    const vacation = await addTimeOff(ctx, marko!.id, {
      type: "VACATION",
      startsOn: "2027-07-01",
      endsOn: "2027-07-03",
      allDay: true,
      reason: null,
    });
    // Europe/Sarajevo is UTC+2 in July: local midnight = 22:00Z the day before.
    expect(vacation.startsAt.toISOString()).toBe("2027-06-30T22:00:00.000Z");
    expect(vacation.endsAt.toISOString()).toBe("2027-07-03T22:00:00.000Z");

    const partial = await addTimeOff(ctx, marko!.id, {
      type: "PERSONAL",
      startsOn: "2027-12-01",
      endsOn: "2027-12-01",
      allDay: false,
      startTime: "13:00",
      endTime: "15:00",
      reason: "Dentist",
    });
    expect(partial.startsAt.toISOString()).toBe("2027-12-01T12:00:00.000Z");
    expect(
      (
        await listTimeOff(ctx, { employeeId: marko!.id, from: new Date("2027-07-02T00:00:00Z") })
      ).map((t) => t.id),
    ).toEqual([vacation.id, partial.id]);

    const block = await addBlockedTime(ctx, {
      employeeId: "",
      date: "2026-10-10",
      startTime: "13:00",
      endTime: "15:00",
      reason: "Cleaning",
    });
    expect(block.employeeId).toBeNull();
    expect(block.startsAt.toISOString()).toBe("2026-10-10T11:00:00.000Z");
    expect(await listBlockedTimes(ctx, { from: new Date("2026-10-10T00:00:00Z") })).toHaveLength(1);
    await removeBlockedTime(ctx, block.id);
    expect(await listBlockedTimes(ctx)).toHaveLength(0);
  });

  it("links an existing user as EMPLOYEE member or sends an invitation", async () => {
    const [marko] = await listEmployees(ctx);
    emails.reset();
    const invited = await inviteEmployeeUser(ctx, marko!.id, `nobody-${Date.now()}@emp.local`, {
      registerUrl: "http://localhost:3000/bs/register",
    });
    expect(invited.linked).toBe(false);
    expect(emails.sent[0]?.tags?.["type"]).toBe("employee.invite");

    const user = await makeActor("staff");
    const linked = await inviteEmployeeUser(ctx, marko!.id, user.email, { registerUrl: "x" });
    expect(linked.linked).toBe(true);
    const membership = await prisma.salonMembership.findUniqueOrThrow({
      where: { userId_salonId: { userId: user.userId, salonId: ctx.salonId } },
    });
    expect(membership).toMatchObject({ role: "EMPLOYEE", employeeId: marko!.id });
    expect((await getEmployee(ctx, marko!.id)).userId).toBe(user.userId);

    const [, ana] = await listEmployees(ctx, { includeInactive: true });
    await expect(
      inviteEmployeeUser(ctx, ana!.id, user.email, { registerUrl: "x" }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Employee role cannot manage staff.
    const staffActor = {
      ...user,
      memberships: [{ salonId: ctx.salonId, role: "EMPLOYEE" as const, employeeId: marko!.id }],
    };
    const staffCtx = await resolveTenantContext(staffActor, { id: ctx.salonId });
    expect(staffCtx.role).toBe("EMPLOYEE");
    await expect(createEmployee(staffCtx, employeeInput)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("shows only active, bookable employees publicly and isolates tenants", async () => {
    const pub = await getPublicSalon(slug, "2026-01-01");
    expect(pub?.employees.map((e) => e.firstName)).toEqual(["Marko"]);

    const other = await makeActor("other");
    const otherSalon = await createSalon(other, {
      name: `${PREFIX} Other`,
      audience: "UNISEX",
      timezone: "Europe/Sarajevo",
      currency: "BAM",
      defaultLocale: "bs",
    });
    const otherCtx = await resolveTenantContext(
      { ...other, memberships: [{ salonId: otherSalon.id, role: "OWNER", employeeId: null }] },
      { id: otherSalon.id },
    );
    expect(await listEmployees(otherCtx)).toHaveLength(0);
    const [marko] = await listEmployees(ctx);
    await expect(getEmployee(otherCtx, marko!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setSchedule(otherCtx, marko!.id, [])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes an employee and unlinks the membership", async () => {
    const [marko] = await listEmployees(ctx);
    await deleteEmployee(ctx, marko!.id);
    await expect(getEmployee(ctx, marko!.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(
      await prisma.salonMembership.count({
        where: { salonId: ctx.salonId, employeeId: marko!.id },
      }),
    ).toBe(0);
    expect(await prisma.employeeSchedule.count({ where: { employeeId: marko!.id } })).toBe(0);
  });
});
