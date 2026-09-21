import { describe, expect, it } from "vitest";

import { localTimeString, wallClockToUtc } from "@/lib/time";
import {
  canClientCancel,
  canTransition,
  computeAvailableSlots,
  intersect,
  normalize,
  rankCandidates,
  subtract,
  unionSlots,
  type AvailabilityInput,
} from "@/modules/booking/engine";

const TZ = "Europe/Sarajevo";
const DATE = "2026-10-10"; // Saturday
const at = (time: string, date = DATE) => wallClockToUtc(date, time, TZ);
const times = (slots: { startsAt: Date }[]) => slots.map((s) => localTimeString(s.startsAt, TZ));

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    localDate: DATE,
    timezone: TZ,
    now: at("08:00", "2026-10-01"),
    salonHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      isClosed: false,
      opensAt: "08:00",
      closesAt: "20:00",
    })),
    salonClosures: [],
    schedule: [{ weekday: 5, startTime: "09:00", endTime: "17:00", breaks: [] }],
    timeOff: [],
    blockedTimes: [],
    bookings: [],
    service: { durationMinutes: 60, bufferMinutes: 0 },
    settings: { slotIntervalMinutes: 60, minBookingNoticeMinutes: 0, maxBookingAdvanceDays: 60 },
    ...overrides,
  };
}

describe("interval algebra", () => {
  it("normalizes, subtracts and intersects half-open intervals", () => {
    const a = { start: at("09:00"), end: at("12:00") };
    const b = { start: at("11:00"), end: at("13:00") };
    expect(normalize([b, a])).toEqual([{ start: at("09:00"), end: at("13:00") }]);
    expect(subtract([a], [{ start: at("10:00"), end: at("11:00") }])).toEqual([
      { start: at("09:00"), end: at("10:00") },
      { start: at("11:00"), end: at("12:00") },
    ]);
    expect(intersect([a], [b])).toEqual([{ start: at("11:00"), end: at("12:00") }]);
    // Touching intervals do not overlap.
    expect(subtract([a], [{ start: at("12:00"), end: at("13:00") }])).toEqual([a]);
  });
});

describe("computeAvailableSlots", () => {
  it("reproduces the example from the brief: 09–17, 60 min service, 10–11 booked", () => {
    const slots = computeAvailableSlots(
      baseInput({ bookings: [{ start: at("10:00"), end: at("11:00") }] }),
    );
    expect(times(slots)).toEqual(["09:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
  });

  it("handles 30-minute intervals, a 45-minute service and a lunch break", () => {
    const slots = computeAvailableSlots(
      baseInput({
        schedule: [
          {
            weekday: 5,
            startTime: "09:00",
            endTime: "17:00",
            breaks: [{ startTime: "13:00", endTime: "13:30" }],
          },
        ],
        bookings: [{ start: at("10:00"), end: at("11:00") }],
        service: { durationMinutes: 45, bufferMinutes: 0 },
        settings: {
          slotIntervalMinutes: 30,
          minBookingNoticeMinutes: 0,
          maxBookingAdvanceDays: 60,
        },
      }),
    );
    expect(times(slots)).toEqual([
      "09:00",
      "11:00",
      "11:30",
      "12:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
    ]);
  });

  it("respects buffers (stored inside the booking end) and service buffer", () => {
    const slots = computeAvailableSlots(
      baseInput({
        schedule: [{ weekday: 5, startTime: "09:00", endTime: "11:00", breaks: [] }],
        service: { durationMinutes: 30, bufferMinutes: 10 },
        settings: {
          slotIntervalMinutes: 30,
          minBookingNoticeMinutes: 0,
          maxBookingAdvanceDays: 60,
        },
      }),
    );
    expect(times(slots)).toEqual(["09:00", "09:30", "10:00"]);
    const afterBooking = computeAvailableSlots(
      baseInput({
        schedule: [{ weekday: 5, startTime: "09:00", endTime: "11:00", breaks: [] }],
        bookings: [{ start: at("09:00"), end: at("09:40") }],
        service: { durationMinutes: 30, bufferMinutes: 10 },
        settings: {
          slotIntervalMinutes: 30,
          minBookingNoticeMinutes: 0,
          maxBookingAdvanceDays: 60,
        },
      }),
    );
    expect(times(afterBooking)).toEqual(["10:00"]);
  });

  it("removes blocked times, time off, closures and salon-closed days", () => {
    expect(
      times(
        computeAvailableSlots(
          baseInput({ blockedTimes: [{ start: at("13:00"), end: at("15:00") }] }),
        ),
      ),
    ).toEqual(["09:00", "10:00", "11:00", "12:00", "15:00", "16:00"]);
    expect(
      computeAvailableSlots(
        baseInput({ timeOff: [{ start: at("00:00"), end: at("00:00", "2026-10-11") }] }),
      ),
    ).toEqual([]);
    expect(
      computeAvailableSlots(
        baseInput({ salonClosures: [{ startsOn: "2026-10-09", endsOn: "2026-10-12" }] }),
      ),
    ).toEqual([]);
    expect(
      computeAvailableSlots(
        baseInput({
          salonHours: [{ weekday: 5, isClosed: true, opensAt: "09:00", closesAt: "17:00" }],
        }),
      ),
    ).toEqual([]);
  });

  it("clips the schedule to salon hours and aligns odd shift starts to the grid", () => {
    const clipped = computeAvailableSlots(
      baseInput({
        salonHours: [{ weekday: 5, isClosed: false, opensAt: "10:00", closesAt: "14:00" }],
      }),
    );
    expect(times(clipped)).toEqual(["10:00", "11:00", "12:00", "13:00"]);
    const aligned = computeAvailableSlots(
      baseInput({
        schedule: [{ weekday: 5, startTime: "09:10", endTime: "10:30", breaks: [] }],
        service: { durationMinutes: 15, bufferMinutes: 0 },
        settings: {
          slotIntervalMinutes: 15,
          minBookingNoticeMinutes: 0,
          maxBookingAdvanceDays: 60,
        },
      }),
    );
    expect(times(aligned)[0]).toBe("09:15");
  });

  it("applies notice and horizon unless staff overrides them", () => {
    const now = at("12:30");
    const withNotice = computeAvailableSlots(
      baseInput({
        now,
        settings: {
          slotIntervalMinutes: 60,
          minBookingNoticeMinutes: 60,
          maxBookingAdvanceDays: 60,
        },
      }),
    );
    expect(times(withNotice)).toEqual(["14:00", "15:00", "16:00"]);
    const staff = computeAvailableSlots(
      baseInput({
        now,
        settings: {
          slotIntervalMinutes: 60,
          minBookingNoticeMinutes: 60,
          maxBookingAdvanceDays: 60,
        },
        ignoreNotice: true,
      }),
    );
    expect(times(staff)[0]).toBe("09:00");
    expect(
      computeAvailableSlots(
        baseInput({
          now: at("08:00", "2026-01-01"),
          settings: {
            slotIntervalMinutes: 60,
            minBookingNoticeMinutes: 0,
            maxBookingAdvanceDays: 30,
          },
        }),
      ),
    ).toEqual([]);
    expect(computeAvailableSlots(baseInput({ now: at("08:00", "2026-10-11") }))).toEqual([]);
  });

  it("treats the rescheduled booking's own interval as free", () => {
    const own = { start: at("10:00"), end: at("11:00") };
    expect(times(computeAvailableSlots(baseInput({ bookings: [own] })))).not.toContain("10:00");
    expect(times(computeAvailableSlots(baseInput({ bookings: [own], exclude: own })))).toContain(
      "10:00",
    );
  });

  it("produces correct wall-clock slots on DST transition days", () => {
    // 2026-03-29 (spring forward) is a Sunday; 2026-10-25 (fall back) is a Sunday.
    const sunday = [{ weekday: 6, startTime: "09:00", endTime: "12:00", breaks: [] }];
    const spring = computeAvailableSlots(
      baseInput({ localDate: "2026-03-29", schedule: sunday, now: at("08:00", "2026-03-01") }),
    );
    expect(times(spring)).toEqual(["09:00", "10:00", "11:00"]);
    expect(spring[0]?.startsAt.toISOString()).toBe("2026-03-29T07:00:00.000Z");
    const fall = computeAvailableSlots(
      baseInput({ localDate: "2026-10-25", schedule: sunday, now: at("08:00", "2026-10-01") }),
    );
    expect(times(fall)).toEqual(["09:00", "10:00", "11:00"]);
    expect(fall[0]?.startsAt.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  it("never returns a slot overlapping a busy interval (property check)", () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let round = 0; round < 50; round += 1) {
      const busy = Array.from({ length: 5 }, () => {
        const startMin = 540 + Math.floor(rnd() * 420);
        const len = 15 + Math.floor(rnd() * 90);
        return {
          start: new Date(at("00:00").getTime() + startMin * 60_000),
          end: new Date(at("00:00").getTime() + (startMin + len) * 60_000),
        };
      });
      const slots = computeAvailableSlots(
        baseInput({
          bookings: busy.slice(0, 3),
          blockedTimes: busy.slice(3),
          service: { durationMinutes: 30, bufferMinutes: 5 },
          settings: {
            slotIntervalMinutes: 15,
            minBookingNoticeMinutes: 0,
            maxBookingAdvanceDays: 60,
          },
        }),
      );
      for (const slot of slots) {
        const end = new Date(slot.startsAt.getTime() + 35 * 60_000);
        for (const b of busy) {
          expect(
            slot.startsAt.getTime() < b.end.getTime() && b.start.getTime() < end.getTime(),
          ).toBe(false);
        }
        expect(slot.startsAt.getTime()).toBeGreaterThanOrEqual(at("09:00").getTime());
        expect(end.getTime()).toBeLessThanOrEqual(at("17:00").getTime());
      }
      expect([...slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())).toEqual(slots);
    }
  });
});

describe("any-employee helpers", () => {
  it("unions slots and ranks candidates deterministically", () => {
    const union = unionSlots([
      { employeeId: "a", slots: [{ startsAt: at("09:00"), endsAt: at("10:00") }] },
      {
        employeeId: "b",
        slots: [
          { startsAt: at("09:00"), endsAt: at("10:00") },
          { startsAt: at("10:00"), endsAt: at("11:00") },
        ],
      },
    ]);
    expect(union.map((u) => [localTimeString(u.startsAt, TZ), u.employeeIds])).toEqual([
      ["09:00", ["a", "b"]],
      ["10:00", ["b"]],
    ]);
    expect(
      rankCandidates([
        { employeeId: "b", bookingsThatDay: 2, sortOrder: 0 },
        { employeeId: "a", bookingsThatDay: 1, sortOrder: 5 },
        { employeeId: "c", bookingsThatDay: 1, sortOrder: 1 },
      ]),
    ).toEqual(["c", "a", "b"]);
  });
});

describe("policies and state machine", () => {
  it("evaluates the cancellation cutoff inclusively", () => {
    const booking = { status: "CONFIRMED", startsAt: at("12:00") };
    expect(canClientCancel(booking, { cancellationCutoffHours: 12 }, at("00:00")).ok).toBe(true);
    expect(canClientCancel(booking, { cancellationCutoffHours: 12 }, at("00:01")).ok).toBe(false);
    expect(
      canClientCancel(
        { status: "COMPLETED", startsAt: at("12:00") },
        { cancellationCutoffHours: 0 },
        at("00:00"),
      ),
    ).toMatchObject({ ok: false, reason: "INVALID_STATUS" });
  });

  it("restricts transitions per actor", () => {
    expect(canTransition("PENDING", "CONFIRMED", "staff")).toBe(true);
    expect(canTransition("PENDING", "CONFIRMED", "client")).toBe(false);
    expect(canTransition("CONFIRMED", "COMPLETED", "employee")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED", "employee")).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED", "staff")).toBe(false);
    expect(canTransition("NO_SHOW", "CONFIRMED", "staff")).toBe(true);
  });
});
