import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnectPrisma, prisma } from "@/lib/db";
import type { Actor } from "@/modules/auth/types";
import { cancelBooking, createPublicBooking, type BookingView } from "@/modules/booking";
import { createEmployee, setSchedule } from "@/modules/employees";
import {
  FakePushProvider,
  InMemoryQueue,
  JOBS,
  dispatchBookingEvent,
  getPushProvider,
  listPushSubscriptions,
  pushPublicConfig,
  relayOutbox,
  removePushSubscription,
  sendPushNotification,
  upsertPushSubscription,
  type DomainEvent,
} from "@/modules/notifications";
import { createSalon, updateSalonSettings } from "@/modules/salons";
import { createService } from "@/modules/services";
import { resolveTenantContext, type TenantContext } from "@/modules/tenant";

const PREFIX = "push-test";
const TZ = "Europe/Sarajevo";

async function makeActor(label: string): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@push.local`,
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

function futureStart(daysAhead: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return new Date(`${d.toISOString().slice(0, 10)}T09:00:00.000Z`);
}

describe("web push", () => {
  let owner: Actor;
  let client: Actor;
  let ctx: TenantContext;
  let slug: string;
  let serviceId: string;
  let employeeId: string;
  let booking: BookingView;
  const queue = new InMemoryQueue();
  const fake = getPushProvider() as FakePushProvider;

  beforeAll(async () => {
    owner = await makeActor("owner");
    client = await makeActor("client");
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
      emailNotificationsEnabled: false, // isolate push in this test
      pushNotificationsEnabled: true,
      notifyAdminsOnNewBooking: true,
      notifyEmployeeOnNewBooking: false,
      reminder24hEnabled: true,
      reminder1hEnabled: true,
      timezone: TZ,
      currency: "BAM",
    });
    const employee = await createEmployee(ctx, {
      firstName: "Pero",
      lastName: "Push",
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
      name: "Push cut",
      description: null,
      priceCents: 1500,
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

  async function relayAndDispatch() {
    await relayOutbox(queue);
    for (const job of queue.take(JOBS.dispatch)) {
      await dispatchBookingEvent(job.data as unknown as DomainEvent, { queue });
    }
  }

  it("exposes the public config for the fake provider", () => {
    expect(pushPublicConfig().enabled).toBe(true);
  });

  it("registers a device and turns the push preference on", async () => {
    const sub = await upsertPushSubscription(client.userId, {
      endpoint: "https://push.example.test/sub/client-1",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
      userAgent: "vitest",
    });
    expect(sub.platform).toBe("WEB");
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: client.userId },
    });
    expect(prefs?.pushEnabled).toBe(true);
    // Re-registering the same endpoint is idempotent.
    await upsertPushSubscription(client.userId, {
      endpoint: "https://push.example.test/sub/client-1",
      keys: { p256dh: "p256dh-key-2", auth: "auth-key" },
    });
    expect(await listPushSubscriptions(client.userId)).toHaveLength(1);
  });

  it("delivers a booking confirmation push to the client's device", async () => {
    fake.reset();
    const result = await createPublicBooking(
      slug,
      { serviceId, employeeId, startsAt: futureStart(3), notes: null },
      client,
    );
    booking = result.booking;
    await relayAndDispatch();

    const rows = await prisma.notification.findMany({ where: { bookingId: booking.id } });
    const push = rows.find((r) => r.channel === "PUSH" && r.type === "BOOKING_CONFIRMED");
    expect(push?.status).toBe("QUEUED");
    expect(push?.userId).toBe(client.userId);
    // The owner has no device: recorded as skipped, nothing queued for them.
    const ownerPush = rows.find((r) => r.channel === "PUSH" && r.type === "STAFF_NEW_BOOKING");
    expect(ownerPush?.status).toBe("SKIPPED");
    expect(ownerPush?.error).toBe("recipient.pushDisabled");

    const jobs = queue.take(JOBS.sendPush);
    expect(jobs).toHaveLength(1);
    expect(await sendPushNotification(jobs[0]!.data["notificationId"] as string)).toBe("sent");
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]!.message.tag).toBe(`booking:${booking.id}`);
    expect(fake.sent[0]!.message.url).toContain("/account/bookings");
    expect(fake.sent[0]!.message.body).toContain("Push cut");
    // Second attempt is a no-op.
    expect(await sendPushNotification(jobs[0]!.data["notificationId"] as string)).toBe("skipped");
  });

  it("marks expired subscriptions and still counts a delivery to the live device", async () => {
    fake.reset();
    await upsertPushSubscription(client.userId, {
      endpoint: "https://push.example.test/sub/gone-device",
      keys: { p256dh: "k", auth: "a" },
    });
    await cancelBooking({ kind: "client", userId: client.userId }, booking.id, {
      reason: null,
      version: booking.version,
    });
    await relayAndDispatch();
    const jobs = queue.take(JOBS.sendPush);
    expect(jobs.length).toBeGreaterThan(0);
    const clientJob = jobs.find((j) => j.data["notificationId"]);
    expect(await sendPushNotification(clientJob!.data["notificationId"] as string)).toBe("sent");
    const gone = await prisma.pushSubscription.findUnique({
      where: { endpoint: "https://push.example.test/sub/gone-device" },
    });
    expect(gone?.failedAt).not.toBeNull();
    expect(await listPushSubscriptions(client.userId)).toHaveLength(1);
    expect(fake.sent).toHaveLength(1);
  });

  it("skips push when the user removed every device", async () => {
    expect(
      await removePushSubscription(client.userId, "https://push.example.test/sub/client-1"),
    ).toBe(true);
    const queued = await prisma.notification.create({
      data: {
        salonId: ctx.salonId,
        bookingId: booking.id,
        userId: client.userId,
        channel: "PUSH",
        type: "REMINDER_1H",
        status: "QUEUED",
        recipient: `user:${client.userId}`,
        locale: "en",
        dedupeKey: `${booking.id}:manual:${Date.now()}`,
        payload: { title: "t", body: "b", url: "/", tag: "x" },
      },
    });
    expect(await sendPushNotification(queued.id)).toBe("skipped");
    const fresh = await prisma.notification.findUniqueOrThrow({ where: { id: queued.id } });
    expect(fresh.status).toBe("SKIPPED");
    expect(fresh.error).toBe("recipient.noSubscription");
  });
});
