import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnectPrisma, prisma } from "@/lib/db";
import type { Actor } from "@/modules/auth/types";
import { ANONYMOUS } from "@/modules/auth/types";
import {
  cancelBooking,
  createPublicBooking,
  rescheduleBooking,
  type BookingView,
} from "@/modules/booking";
import { createEmployee, setSchedule } from "@/modules/employees";
import {
  FakeEmailProvider,
  InMemoryQueue,
  JOBS,
  dispatchBookingEvent,
  getEmailProvider,
  relayOutbox,
  scheduleReminderJobs,
  sendDueReminder,
  sendEmailNotification,
  sweepReminders,
  type DomainEvent,
} from "@/modules/notifications";
import { createSalon, updateSalonSettings } from "@/modules/salons";
import { createService } from "@/modules/services";
import { resolveTenantContext, type TenantContext } from "@/modules/tenant";

const PREFIX = "notif-test";
const TZ = "Europe/Sarajevo";

async function makeActor(label: string): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@notif.local`,
      name: `${label} User`,
      emailVerified: true,
      firstName: label,
      lastName: "User",
      locale: "en",
    },
  });
  return {
    kind: "user",
    userId: user.id,
    email: user.email,
    name: user.name,
    emailVerified: true,
    isActive: true,
    locale: "en",
    platformRole: null,
    memberships: [],
  };
}

/** Next weekday at least 3 days out, 10:00 local. */
function futureStart(daysAhead: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  const date = d.toISOString().slice(0, 10);
  return new Date(`${date}T08:00:00.000Z`); // 10:00 Sarajevo in summer, 09:00 in winter — both open
}

describe("notifications pipeline", () => {
  let owner: Actor;
  let ctx: TenantContext;
  let slug: string;
  let serviceId: string;
  let employeeId: string;
  const queue = new InMemoryQueue();
  const fake = getEmailProvider() as FakeEmailProvider;

  beforeAll(async () => {
    owner = await makeActor("owner");
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
      minBookingNoticeMinutes: 0,
      maxBookingAdvanceDays: 90,
      cancellationCutoffHours: 1,
      rescheduleCutoffHours: 1,
      bufferMinutes: 0,
      autoConfirmBookings: true,
      allowAnyEmployee: true,
      allowGuestBooking: true,
      requirePhone: false,
      emailNotificationsEnabled: true,
      pushNotificationsEnabled: true,
      notifyAdminsOnNewBooking: true,
      notifyEmployeeOnNewBooking: true,
      reminder24hEnabled: true,
      reminder1hEnabled: true,
      timezone: TZ,
      currency: "BAM",
    });
    const employee = await createEmployee(ctx, {
      firstName: "Nera",
      lastName: "Notif",
      email: null,
      phone: null,
      position: null,
      bio: null,
      audience: "UNISEX",
      color: null,
      isActive: true,
      isBookableOnline: true,
    });
    employeeId = employee.id;
    await setSchedule(
      ctx,
      employee.id,
      [0, 1, 2, 3, 4].map((weekday) => ({
        weekday,
        startTime: "08:00",
        endTime: "18:00",
        breaks: [],
      })),
    );
    const service = await createService(ctx, {
      name: "Notif cut",
      description: null,
      priceCents: 2000,
      durationMinutes: 30,
      bufferAfterMinutes: 0,
      audience: "UNISEX",
      categoryId: null,
      isActive: true,
      employeeIds: [employee.id],
    });
    serviceId = service.id;
  });

  afterAll(async () => {
    await prisma.salon.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await disconnectPrisma();
  });

  async function relayAndDispatch(): Promise<DomainEvent[]> {
    await relayOutbox(queue);
    const jobs = queue.take(JOBS.dispatch);
    for (const job of jobs)
      await dispatchBookingEvent(job.data as unknown as DomainEvent, { queue });
    return jobs.map((j) => j.data as unknown as DomainEvent);
  }

  async function drainEmails(): Promise<number> {
    const jobs = queue.take(JOBS.sendEmail);
    for (const job of jobs) await sendEmailNotification(job.data["notificationId"] as string);
    return jobs.length;
  }

  let booking: BookingView;
  const guestEmail = `${PREFIX}-guest@notif.local`;

  it("relays the outbox, creates deduplicated notifications and sends the guest a confirmation with a manage link", async () => {
    fake.reset();
    const result = await createPublicBooking(
      slug,
      {
        serviceId,
        employeeId,
        startsAt: futureStart(3),
        customer: {
          firstName: "Guest",
          lastName: "Notif",
          email: guestEmail,
          phone: "+387 61 000 000",
        },
        notes: "Kratko sa strane",
      },
      ANONYMOUS,
    );
    booking = result.booking;

    const events = await relayAndDispatch();
    expect(events.map((e) => e.type)).toEqual(["booking.created"]);
    const published = await prisma.outboxEvent.findMany({ where: { aggregateId: booking.id } });
    expect(published.every((e) => e.status === "PUBLISHED")).toBe(true);

    const rows = await prisma.notification.findMany({ where: { bookingId: booking.id } });
    const summary = rows.map((r) => `${r.type}/${r.channel}/${r.status}`).sort();
    expect(summary).toEqual(
      [
        "BOOKING_CONFIRMED/EMAIL/QUEUED",
        "STAFF_NEW_BOOKING/EMAIL/QUEUED",
        "STAFF_NEW_BOOKING/IN_APP/SENT",
      ].sort(),
    );

    // Reminder jobs were scheduled with the reminder time.
    const reminders = await prisma.bookingReminder.findMany({ where: { bookingId: booking.id } });
    expect(reminders).toHaveLength(2);
    expect(reminders.every((r) => r.jobId !== null)).toBe(true);
    const reminderJobs = queue.take(JOBS.reminderSend);
    expect(reminderJobs.map((j) => j.options?.startAfter?.getTime()).sort()).toEqual(
      reminders.map((r) => r.scheduledFor.getTime()).sort(),
    );

    // Re-dispatching the same event is a no-op.
    await dispatchBookingEvent(events[0]!, { queue });
    expect(await prisma.notification.count({ where: { bookingId: booking.id } })).toBe(3);

    expect(await drainEmails()).toBe(2);
    const guestMail = fake.lastTo(guestEmail);
    expect(guestMail?.subject).toContain(`${PREFIX} Salon`);
    expect(guestMail?.text).toMatch(/\/bs\/b\/[A-Za-z0-9_-]{20,}/);
    expect(guestMail?.attachments?.[0]?.filename).toBe("appointment.ics");
    const staffMail = fake.lastTo(owner.email);
    expect(staffMail?.subject).toContain("New booking");
    expect(staffMail?.text).toContain("Kratko sa strane");

    const sent = await prisma.notification.findMany({
      where: { bookingId: booking.id, channel: "EMAIL" },
    });
    expect(sent.every((n) => n.status === "SENT" && n.providerMessageId)).toBe(true);

    // The manage link in the email works: its token hash exists.
    const tokens = await prisma.bookingAccessToken.count({ where: { bookingId: booking.id } });
    expect(tokens).toBe(2); // one from the booking response, one embedded in the email
  });

  it("sends a reminder exactly once and skips it after the booking moved", async () => {
    fake.reset();
    const h1 = await prisma.bookingReminder.findFirstOrThrow({
      where: { bookingId: booking.id, kind: "H1" },
    });
    expect(await sendDueReminder(h1.id, { queue })).toBe("sent");
    expect(await sendDueReminder(h1.id, { queue })).toBe("not-claimed");
    expect(await drainEmails()).toBe(1);
    expect(fake.lastTo(guestEmail)?.subject).toMatch(/za sat|in an hour/);

    // Reschedule → the old H24 reminder is CANCELLED, a new one is SCHEDULED without a job.
    const moved = await rescheduleBooking({ kind: "staff", ctx }, booking.id, {
      startsAt: futureStart(5),
      employeeId,
      version: booking.version,
    });
    const events = await relayAndDispatch();
    expect(events.map((e) => e.type)).toEqual(["booking.rescheduled"]);
    const fresh = await prisma.bookingReminder.findMany({
      where: { bookingId: booking.id, status: "SCHEDULED" },
    });
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((r) => r.jobId !== null)).toBe(true);

    const rows = await prisma.notification.findMany({
      where: { bookingId: booking.id, type: "BOOKING_RESCHEDULED" },
    });
    expect(rows).toHaveLength(1);
    await drainEmails();
    expect(fake.lastTo(guestEmail)?.text).toMatch(/Prethodno|Previously/);
    expect(moved.version).toBe(booking.version + 1);
    booking = moved;

    // A stale claim on the cancelled reminder is a no-op; the sweep finds nothing due.
    const stale = await prisma.bookingReminder.findFirstOrThrow({
      where: { bookingId: booking.id, status: "CANCELLED" },
    });
    expect(await sendDueReminder(stale.id, { queue })).toBe("not-claimed");
    expect(await sweepReminders(queue, new Date())).toBe(0);
  });

  it("marks emails SKIPPED with a reason when the salon disables email, and cancellation notifies staff", async () => {
    fake.reset();
    await prisma.salonSettings.update({
      where: { salonId: ctx.salonId },
      data: { emailNotificationsEnabled: false },
    });
    await cancelBooking({ kind: "staff", ctx }, booking.id, {
      reason: "Test",
      version: booking.version,
    });
    await relayAndDispatch();
    const rows = await prisma.notification.findMany({
      where: {
        bookingId: booking.id,
        type: { in: ["BOOKING_CANCELLED", "STAFF_BOOKING_CANCELLED"] },
      },
    });
    const emails = rows.filter((r) => r.channel === "EMAIL");
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((r) => r.status === "SKIPPED" && r.error === "salon.emailDisabled")).toBe(
      true,
    );
    expect(queue.take(JOBS.sendEmail)).toHaveLength(0);
    // Staff who cancelled are excluded; the owner did it, so no staff row for them.
    expect(
      rows.some((r) => r.type === "STAFF_BOOKING_CANCELLED" && r.userId === owner.userId),
    ).toBe(false);
    expect(await scheduleReminderJobs(booking.id, queue)).toBe(0);
  });
});
