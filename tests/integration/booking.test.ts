import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnectPrisma, prisma } from "@/lib/db";
import {
  ConflictError,
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  PolicyViolationError,
  SlotUnavailableError,
} from "@/lib/errors";
import { localDateString, wallClockToUtc } from "@/lib/time";
import type { Actor } from "@/modules/auth/types";
import { ANONYMOUS } from "@/modules/auth/types";
import {
  cancelBooking,
  changeBookingStatus,
  createAdminBooking,
  createBooking,
  createPublicBooking,
  getBookingByToken,
  hashToken,
  listBookingsForSalon,
  listBookingsForUser,
  loadAvailabilityContext,
  rescheduleBooking,
  slotsForAnyEmployee,
  slotsForEmployee,
} from "@/modules/booking";
import { createEmployee, setSchedule } from "@/modules/employees";
import { createSalon, updateSalonSettings } from "@/modules/salons";
import { createService } from "@/modules/services";
import { resolveTenantContext, type TenantContext } from "@/modules/tenant";

const PREFIX = "book-test";
const TZ = "Europe/Sarajevo";

async function makeActor(label: string): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@book.local`,
      name: `${label} User`,
      emailVerified: true,
      firstName: label,
      lastName: "User",
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
    memberships: [],
  };
}

/** Next Monday at least 3 days out, as a local date string. */
function nextMonday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 3);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const guest = (n: number) => ({
  firstName: "Gost",
  lastName: `Broj${n}`,
  email: `guest${n}-${Date.now()}@book.local`,
  phone: "+387 61 000 000",
});

describe("booking engine (integration)", () => {
  let ctx: TenantContext;
  let slug: string;
  let marko: string;
  let ana: string;
  let haircut: string;
  let monday: string;

  beforeAll(async () => {
    await prisma.salon.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@book.local" } } });
    const owner = await makeActor("owner");
    const salon = await createSalon(owner, {
      name: `${PREFIX} Salon`,
      audience: "UNISEX",
      timezone: TZ,
      currency: "BAM",
      defaultLocale: "bs",
    });
    slug = salon.slug;
    ctx = await resolveTenantContext(
      { ...owner, memberships: [{ salonId: salon.id, role: "OWNER", employeeId: null }] },
      { id: salon.id },
    );
    await updateSalonSettings(ctx, {
      slotIntervalMinutes: 30,
      minBookingNoticeMinutes: 60,
      maxBookingAdvanceDays: 60,
      cancellationCutoffHours: 12,
      rescheduleCutoffHours: 12,
      bufferMinutes: 0,
      autoConfirmBookings: true,
      allowAnyEmployee: true,
      allowGuestBooking: true,
      requirePhone: true,
      emailNotificationsEnabled: true,
      pushNotificationsEnabled: true,
      notifyAdminsOnNewBooking: true,
      notifyEmployeeOnNewBooking: true,
      reminder24hEnabled: true,
      reminder1hEnabled: true,
      timezone: TZ,
      currency: "BAM",
    });
    const base = {
      position: null,
      bio: null,
      email: null,
      phone: null,
      audience: "UNISEX" as const,
      color: null,
      isActive: true,
      isBookableOnline: true,
    };
    marko = (await createEmployee(ctx, { ...base, firstName: "Marko", lastName: "M" })).id;
    ana = (await createEmployee(ctx, { ...base, firstName: "Ana", lastName: "A" })).id;
    await setSchedule(ctx, marko, [
      { weekday: 0, startTime: "09:00", endTime: "17:00", breaks: [] },
    ]);
    await setSchedule(ctx, ana, [{ weekday: 0, startTime: "10:00", endTime: "14:00", breaks: [] }]);
    haircut = (
      await createService(ctx, {
        name: "Haircut",
        description: null,
        categoryId: null,
        priceCents: 2000,
        durationMinutes: 60,
        bufferAfterMinutes: 0,
        audience: "UNISEX",
        isActive: true,
        employeeIds: [marko, ana],
      })
    ).id;
    monday = nextMonday();
  });

  afterAll(async () => {
    await prisma.salon.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@book.local" } } });
    await disconnectPrisma();
  });

  it("offers slots per employee and as a union for 'any'", async () => {
    const context = await loadAvailabilityContext(prisma, {
      salonId: ctx.salonId,
      serviceId: haircut,
      fromDate: monday,
      toDate: monday,
    });
    const now = new Date();
    expect(
      slotsForEmployee(context, marko, monday, now).map((s) => s.startsAt.toISOString()),
    ).toContain(wallClockToUtc(monday, "09:00", TZ).toISOString());
    const union = slotsForAnyEmployee(context, monday, now);
    const tenOClock = union.find(
      (s) => s.startsAt.getTime() === wallClockToUtc(monday, "10:00", TZ).getTime(),
    );
    expect(tenOClock?.employeeIds.sort()).toEqual([ana, marko].sort());
    expect(
      union.find((s) => s.startsAt.getTime() === wallClockToUtc(monday, "16:00", TZ).getTime())
        ?.employeeIds,
    ).toEqual([marko]);
  });

  it("creates a guest booking with token, reminders, history and outbox event", async () => {
    const startsAt = wallClockToUtc(monday, "09:00", TZ);
    const result = await createPublicBooking(
      slug,
      {
        serviceId: haircut,
        employeeId: marko,
        startsAt,
        customer: guest(1),
        notes: "Kratko",
        locale: "bs",
      },
      ANONYMOUS,
    );
    expect(result.booking).toMatchObject({
      status: "CONFIRMED",
      priceCents: 2000,
      durationMinutes: 60,
      version: 1,
      source: "ONLINE",
    });
    expect(result.booking.employee.id).toBe(marko);
    expect(result.manageToken).toBeTruthy();

    const token = await prisma.bookingAccessToken.findUnique({
      where: { tokenHash: hashToken(result.manageToken!) },
    });
    expect(token?.bookingId).toBe(result.booking.id);
    expect(
      await prisma.bookingReminder.count({
        where: { bookingId: result.booking.id, status: "SCHEDULED" },
      }),
    ).toBe(2);
    expect(
      await prisma.bookingStatusHistory.count({
        where: { bookingId: result.booking.id, action: "CREATED" },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: result.booking.id, type: "booking.created" },
      }),
    ).toBe(1);

    const viaToken = await getBookingByToken(result.manageToken!);
    expect(viaToken.id).toBe(result.booking.id);
    expect(viaToken.policy.canCancel).toBe(true);
    await expect(getBookingByToken("not-a-real-token-value-at-all")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects a slot that is already taken and slots outside working time or notice", async () => {
    const taken = wallClockToUtc(monday, "09:00", TZ);
    await expect(
      createPublicBooking(
        slug,
        { serviceId: haircut, employeeId: marko, startsAt: taken, customer: guest(2), notes: null },
        ANONYMOUS,
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
    await expect(
      createPublicBooking(
        slug,
        {
          serviceId: haircut,
          employeeId: marko,
          startsAt: wallClockToUtc(monday, "08:00", TZ),
          customer: guest(3),
          notes: null,
        },
        ANONYMOUS,
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
    await expect(
      createPublicBooking(
        slug,
        {
          serviceId: haircut,
          employeeId: marko,
          startsAt: wallClockToUtc(monday, "09:15", TZ),
          customer: guest(4),
          notes: null,
        },
        ANONYMOUS,
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
    // Guest bookings require a phone when the salon says so.
    await expect(
      createPublicBooking(
        slug,
        {
          serviceId: haircut,
          employeeId: marko,
          startsAt: wallClockToUtc(monday, "11:00", TZ),
          customer: { ...guest(5), phone: null },
          notes: null,
        },
        ANONYMOUS,
      ),
    ).rejects.toThrow();
  });

  it("lets exactly one of two concurrent bookings for the same slot through", async () => {
    const startsAt = wallClockToUtc(monday, "12:00", TZ);
    const attempts = await Promise.allSettled([
      createPublicBooking(
        slug,
        { serviceId: haircut, employeeId: marko, startsAt, customer: guest(6), notes: null },
        ANONYMOUS,
      ),
      createPublicBooking(
        slug,
        { serviceId: haircut, employeeId: marko, startsAt, customer: guest(7), notes: null },
        ANONYMOUS,
      ),
    ]);
    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter((a) => a.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(SlotUnavailableError);
    expect(await prisma.booking.count({ where: { employeeId: marko, startsAt } })).toBe(1);
  });

  it("is protected by the exclusion constraint even when the application lock is bypassed", async () => {
    const existing = await prisma.booking.findFirstOrThrow({
      where: { employeeId: marko, startsAt: wallClockToUtc(monday, "12:00", TZ) },
    });
    await expect(
      prisma.booking.create({
        data: {
          salonId: ctx.salonId,
          customerId: existing.customerId,
          employeeId: marko,
          serviceId: haircut,
          status: "CONFIRMED",
          startsAt: wallClockToUtc(monday, "12:30", TZ),
          endsAt: wallClockToUtc(monday, "13:30", TZ),
          durationMinutes: 60,
          priceCents: 2000,
          currency: "BAM",
          serviceNameSnapshot: "Haircut",
        },
      }),
    ).rejects.toThrow(/bookings_no_overlap|23P01|exclusion/i);
  });

  it("assigns 'any' to the least loaded eligible employee", async () => {
    const startsAt = wallClockToUtc(monday, "10:00", TZ);
    const result = await createPublicBooking(
      slug,
      { serviceId: haircut, employeeId: "any", startsAt, customer: guest(8), notes: null },
      ANONYMOUS,
    );
    // Marko already has two bookings that day; Ana has none.
    expect(result.booking.employee.id).toBe(ana);
  });

  it("reschedules within policy, frees the old slot and regenerates reminders", async () => {
    const view = (await listBookingsForSalon(ctx, {})).find(
      (b) =>
        b.employee.id === marko &&
        b.startsAt.getTime() === wallClockToUtc(monday, "09:00", TZ).getTime(),
    )!;
    const token = await prisma.bookingAccessToken.findFirstOrThrow({
      where: { bookingId: view.id },
    });
    // The token value is not stored; use the client path instead by promoting the customer to a user.
    const user = await makeActor("client");
    await prisma.customer.update({
      where: { id: view.customer.id },
      data: { userId: user.userId },
    });
    expect(token.bookingId).toBe(view.id);

    await expect(
      rescheduleBooking({ kind: "client", userId: user.userId }, view.id, {
        startsAt: wallClockToUtc(monday, "15:00", TZ),
        version: 999,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const moved = await rescheduleBooking({ kind: "client", userId: user.userId }, view.id, {
      startsAt: wallClockToUtc(monday, "15:00", TZ),
      version: view.version,
    });
    expect(moved.startsAt.toISOString()).toBe(wallClockToUtc(monday, "15:00", TZ).toISOString());
    expect(moved.version).toBe(view.version + 1);

    const context = await loadAvailabilityContext(prisma, {
      salonId: ctx.salonId,
      serviceId: haircut,
      fromDate: monday,
      toDate: monday,
    });
    const markoSlots = slotsForEmployee(context, marko, monday, new Date()).map((s) =>
      s.startsAt.getTime(),
    );
    expect(markoSlots).toContain(wallClockToUtc(monday, "09:00", TZ).getTime());
    expect(markoSlots).not.toContain(wallClockToUtc(monday, "15:00", TZ).getTime());

    const reminders = await prisma.bookingReminder.findMany({
      where: { bookingId: view.id },
      orderBy: { scheduledFor: "asc" },
    });
    expect(reminders.filter((r) => r.status === "CANCELLED")).toHaveLength(2);
    expect(
      reminders.filter((r) => r.status === "SCHEDULED").map((r) => r.scheduledFor.toISOString()),
    ).toEqual([
      new Date(moved.startsAt.getTime() - 24 * 3_600_000).toISOString(),
      new Date(moved.startsAt.getTime() - 3_600_000).toISOString(),
    ]);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: view.id, type: "booking.rescheduled" },
      }),
    ).toBe(1);
    expect((await listBookingsForUser(user.userId, "upcoming")).map((b) => b.id)).toContain(
      view.id,
    );
  });

  it("enforces the cancellation cutoff for clients but not for staff", async () => {
    const soon = new Date(Date.now() + 2 * 3_600_000);
    // Staff can create inside the notice window on the current day if working; use admin path with a far date instead.
    const admin = await createAdminBooking(ctx, {
      serviceId: haircut,
      employeeId: marko,
      startsAt: wallClockToUtc(monday, "16:00", TZ),
      customer: guest(9),
      source: "WALK_IN",
      internalNotes: "Telefon",
      status: "CONFIRMED",
    });
    expect(admin.booking.source).toBe("WALK_IN");
    expect(admin.manageToken).toBeNull();

    const user = await makeActor("late");
    await prisma.customer.update({
      where: { id: admin.booking.customer.id },
      data: { userId: user.userId },
    });
    // Simulate a booking that starts in 2 hours by moving it directly (bypassing rules) then check policy.
    await prisma.booking.update({
      where: { id: admin.booking.id },
      data: { startsAt: soon, endsAt: new Date(soon.getTime() + 3_600_000) },
    });
    await expect(
      cancelBooking({ kind: "client", userId: user.userId }, admin.booking.id, {
        reason: null,
        version: 1,
      }),
    ).rejects.toBeInstanceOf(PolicyViolationError);
    const cancelled = await cancelBooking({ kind: "staff", ctx }, admin.booking.id, {
      reason: "Klijent nazvao",
      version: 1,
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(
      await prisma.bookingReminder.count({
        where: { bookingId: admin.booking.id, status: "SCHEDULED" },
      }),
    ).toBe(0);
    await expect(
      changeBookingStatus(ctx, admin.booking.id, { status: "CONFIRMED", reason: null, version: 2 }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("lets staff complete past appointments and employees only their own", async () => {
    const past = new Date(Date.now() - 3 * 3_600_000);
    const created = await createBooking({
      salonId: ctx.salonId,
      serviceId: haircut,
      employeeId: ana,
      startsAt: wallClockToUtc(monday, "13:00", TZ),
      customer: guest(10),
      source: "ADMIN",
      ignoreNotice: true,
      actor: ctx.actor,
    });
    await prisma.booking.update({
      where: { id: created.booking.id },
      data: { startsAt: past, endsAt: new Date(past.getTime() + 3_600_000) },
    });

    const staffUser = await makeActor("staff");
    await prisma.salonMembership.create({
      data: { salonId: ctx.salonId, userId: staffUser.userId, role: "EMPLOYEE", employeeId: marko },
    });
    const markoCtx = await resolveTenantContext(
      {
        ...staffUser,
        memberships: [{ salonId: ctx.salonId, role: "EMPLOYEE", employeeId: marko }],
      },
      { id: ctx.salonId },
    );
    // Marko cannot touch Ana's booking (404: not in own scope) and sees only own bookings.
    await expect(
      changeBookingStatus(markoCtx, created.booking.id, {
        status: "COMPLETED",
        reason: null,
        version: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await listBookingsForSalon(markoCtx, {})).every((b) => b.employee.id === marko)).toBe(
      true,
    );
    const own = (await listBookingsForSalon(markoCtx, {})).find((b) => b.status === "CONFIRMED")!;
    await expect(
      cancelBooking({ kind: "staff", ctx: markoCtx }, own.id, {
        reason: null,
        version: own.version,
      }),
    ).rejects.toThrow(ForbiddenError);

    const completed = await changeBookingStatus(ctx, created.booking.id, {
      status: "COMPLETED",
      reason: null,
      version: 1,
    });
    expect(completed.status).toBe("COMPLETED");
    expect(localDateString(completed.startsAt, TZ)).toBe(localDateString(past, TZ));
  });

  it("keeps bookings isolated per salon", async () => {
    const other = await makeActor("other");
    const otherSalon = await createSalon(other, {
      name: `${PREFIX} Other`,
      audience: "UNISEX",
      timezone: TZ,
      currency: "BAM",
      defaultLocale: "bs",
    });
    const otherCtx = await resolveTenantContext(
      { ...other, memberships: [{ salonId: otherSalon.id, role: "OWNER", employeeId: null }] },
      { id: otherSalon.id },
    );
    expect(await listBookingsForSalon(otherCtx, {})).toHaveLength(0);
    const [any] = await listBookingsForSalon(ctx, {});
    await expect(
      changeBookingStatus(otherCtx, any!.id, {
        status: "CANCELLED",
        reason: null,
        version: any!.version,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
