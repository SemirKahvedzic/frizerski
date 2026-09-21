import { describe, expect, it } from "vitest";

import {
  buildPlan,
  dedupeKeyFor,
  type PlanModel,
  type Recipient,
} from "@/modules/notifications/plan";
import { renderIcs } from "@/modules/notifications/render/ics";

const prefsOn = {
  emailEnabled: true,
  pushEnabled: true,
  reminder24h: true,
  reminder1h: true,
  marketingEmails: false,
};

const guest: Recipient = {
  key: "customer:c1",
  kind: "customer",
  name: "Guest One",
  email: "guest@example.com",
  locale: "bs",
  userId: null,
  prefs: null,
  pushSubscriptions: 0,
};
const owner: Recipient = {
  key: "user:u-owner",
  kind: "staff",
  name: "Owner",
  email: "owner@example.com",
  locale: "en",
  userId: "u-owner",
  prefs: prefsOn,
  pushSubscriptions: 1,
};
const employee: Recipient = {
  key: "user:u-emp",
  kind: "staff",
  name: "Emp",
  email: "emp@example.com",
  locale: "bs",
  userId: "u-emp",
  prefs: { ...prefsOn, emailEnabled: false },
  pushSubscriptions: 0,
};

const settingsOn = {
  emailNotificationsEnabled: true,
  pushNotificationsEnabled: true,
  notifyAdminsOnNewBooking: true,
  notifyEmployeeOnNewBooking: true,
  reminder24hEnabled: true,
  reminder1hEnabled: true,
};

const model = (overrides: Partial<PlanModel> = {}): PlanModel => ({
  settings: settingsOn,
  customer: guest,
  admins: [owner],
  employee,
  ...overrides,
});

const summary = (items: ReturnType<typeof buildPlan>) =>
  items.map(
    (i) => `${i.type}/${i.channel}/${i.recipient.key}${i.skipReason ? `!${i.skipReason}` : ""}`,
  );

describe("notification plan", () => {
  it("confirms the guest and notifies admins + employee on a new auto-confirmed booking", () => {
    const items = buildPlan({ kind: "booking.created", status: "CONFIRMED" }, model());
    expect(summary(items)).toEqual([
      "BOOKING_CONFIRMED/EMAIL/customer:c1",
      "STAFF_NEW_BOOKING/EMAIL/user:u-owner",
      "STAFF_NEW_BOOKING/PUSH/user:u-owner",
      "STAFF_NEW_BOOKING/IN_APP/user:u-owner",
      "STAFF_NEW_BOOKING/EMAIL/user:u-emp!recipient.emailDisabled",
      "STAFF_NEW_BOOKING/PUSH/user:u-emp!recipient.noSubscription",
      "STAFF_NEW_BOOKING/IN_APP/user:u-emp",
    ]);
  });

  it("uses the pending type when the salon confirms manually and honours salon switches", () => {
    const items = buildPlan(
      { kind: "booking.created", status: "PENDING" },
      model({
        settings: {
          ...settingsOn,
          notifyAdminsOnNewBooking: false,
          notifyEmployeeOnNewBooking: false,
        },
      }),
    );
    expect(summary(items)).toEqual(["BOOKING_PENDING/EMAIL/customer:c1"]);
  });

  it("records SKIPPED rows when the salon disabled email or push entirely", () => {
    const items = buildPlan(
      { kind: "booking.cancelled", byStaff: true },
      model({
        settings: {
          ...settingsOn,
          emailNotificationsEnabled: false,
          pushNotificationsEnabled: false,
        },
      }),
    );
    expect(
      items
        .filter((i) => i.channel === "EMAIL")
        .every((i) => i.skipReason === "salon.emailDisabled"),
    ).toBe(true);
    expect(
      items.filter((i) => i.channel === "PUSH").every((i) => i.skipReason === "salon.pushDisabled"),
    ).toBe(true);
    expect(items.some((i) => i.channel === "IN_APP" && !i.skipReason)).toBe(true);
  });

  it("excludes the acting staff member and adds the previous employee on reschedule", () => {
    const prev: Recipient = { ...employee, key: "user:u-prev", userId: "u-prev", prefs: prefsOn };
    const items = buildPlan({ kind: "booking.rescheduled" }, model({ previousEmployee: prev }), {
      actorUserId: "u-owner",
    });
    const keys = items.map((i) => i.recipient.key);
    expect(keys).not.toContain("user:u-owner");
    expect(keys).toContain("user:u-prev");
    expect(items[0]).toMatchObject({
      type: "BOOKING_RESCHEDULED",
      channel: "EMAIL",
      skipReason: null,
    });
  });

  it("sends push to account holders with a device and respects their reminder preferences", () => {
    const client: Recipient = {
      ...guest,
      key: "user:u-client",
      userId: "u-client",
      prefs: { ...prefsOn, reminder1h: false },
      pushSubscriptions: 2,
    };
    expect(summary(buildPlan({ kind: "booking.confirmed" }, model({ customer: client })))).toEqual([
      "BOOKING_CONFIRMED/EMAIL/user:u-client",
      "BOOKING_CONFIRMED/PUSH/user:u-client",
      "BOOKING_CONFIRMED/IN_APP/user:u-client",
    ]);
    expect(
      summary(buildPlan({ kind: "reminder", reminderKind: "H1" }, model({ customer: client }))),
    ).toEqual([
      "REMINDER_1H/EMAIL/user:u-client!recipient.reminder1hDisabled",
      "REMINDER_1H/PUSH/user:u-client!recipient.reminder1hDisabled",
    ]);
    expect(summary(buildPlan({ kind: "reminder", reminderKind: "H1" }, model()))).toEqual([
      "REMINDER_1H/EMAIL/customer:c1",
    ]);
    expect(
      summary(
        buildPlan(
          { kind: "reminder", reminderKind: "H24" },
          model({ settings: { ...settingsOn, reminder24hEnabled: false } }),
        ),
      ),
    ).toEqual(["REMINDER_24H/EMAIL/customer:c1!salon.reminder24hDisabled"]);
  });

  it("builds stable dedupe keys", () => {
    expect(
      dedupeKeyFor({
        bookingId: "b",
        type: "REMINDER_1H",
        channel: "EMAIL",
        recipientKey: "customer:c1",
        version: 2,
        reminderId: "r1",
      }),
    ).toBe("b:REMINDER_1H:EMAIL:customer:c1:2:r1");
  });
});

describe("ics", () => {
  it("renders a folded, escaped VEVENT", () => {
    const ics = renderIcs({
      uid: "abc@bookly",
      sequence: 2,
      startsAt: new Date("2026-10-05T08:00:00Z"),
      endsAt: new Date("2026-10-05T08:30:00Z"),
      summary: "Šišanje; Studio, Example",
      stamp: new Date("2026-09-21T10:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20261005T080000Z");
    expect(ics).toContain("SUMMARY:Šišanje\\; Studio\\, Example");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
  });
});
