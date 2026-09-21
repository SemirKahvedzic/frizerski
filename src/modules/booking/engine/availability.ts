import {
  compareDateStrings,
  jsDayToWeekday,
  localDateString,
  localTimeString,
  minutesToTime,
  timeToMinutes,
  wallClockToUtc,
} from "@/lib/time";
import {
  addMinutes,
  intersect,
  normalize,
  subtract,
  type Interval,
} from "@/modules/booking/engine/intervals";

/**
 * Pure availability engine (docs/booking-system.md §3).
 *
 * All inputs are plain data; `now` is injected. The same function runs on the
 * read path (availability API) and inside the booking transaction, so the two
 * can never disagree.
 */
export type WorkingHoursDay = {
  weekday: number;
  isClosed: boolean;
  opensAt: string;
  closesAt: string;
};
export type ScheduleBlockInput = {
  weekday: number;
  startTime: string;
  endTime: string;
  breaks: { startTime: string; endTime: string }[];
};
export type ClosureInput = { startsOn: string; endsOn: string };

export type AvailabilityInput = {
  /** "YYYY-MM-DD" in the salon time zone. */
  localDate: string;
  timezone: string;
  now: Date;
  salonHours: WorkingHoursDay[];
  salonClosures: ClosureInput[];
  schedule: ScheduleBlockInput[];
  timeOff: Interval[];
  blockedTimes: Interval[];
  /** Existing PENDING/CONFIRMED bookings; `end` already includes their buffer. */
  bookings: Interval[];
  service: { durationMinutes: number; bufferMinutes: number };
  settings: {
    slotIntervalMinutes: number;
    minBookingNoticeMinutes: number;
    maxBookingAdvanceDays: number;
  };
  /** Reschedule: the booking's own interval counts as free. */
  exclude?: Interval;
  /** Staff bookings ignore the notice/horizon rules but never working hours. */
  ignoreNotice?: boolean;
};

export type Slot = { startsAt: Date; endsAt: Date };

export function addDaysToDateString(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOfDateString(localDate: string): number {
  return jsDayToWeekday(new Date(`${localDate}T00:00:00.000Z`).getUTCDay());
}

/** Working time for one employee on one local date, before bookings are removed. */
export function workingIntervals(input: AvailabilityInput): Interval[] {
  const { localDate, timezone } = input;
  const weekday = weekdayOfDateString(localDate);

  const hours = input.salonHours.find((h) => h.weekday === weekday);
  if (!hours || hours.isClosed) return [];
  if (
    input.salonClosures.some(
      (c) =>
        compareDateStrings(c.startsOn, localDate) <= 0 &&
        compareDateStrings(localDate, c.endsOn) <= 0,
    )
  ) {
    return [];
  }

  const salonInterval: Interval = {
    start: wallClockToUtc(localDate, hours.opensAt, timezone),
    end: wallClockToUtc(localDate, hours.closesAt, timezone),
  };

  const blocks = input.schedule
    .filter((b) => b.weekday === weekday)
    .map((b) => ({
      start: wallClockToUtc(localDate, b.startTime, timezone),
      end: wallClockToUtc(localDate, b.endTime, timezone),
    }));
  const breaks = input.schedule
    .filter((b) => b.weekday === weekday)
    .flatMap((b) =>
      b.breaks.map((br) => ({
        start: wallClockToUtc(localDate, br.startTime, timezone),
        end: wallClockToUtc(localDate, br.endTime, timezone),
      })),
    );

  const working = intersect(blocks, [salonInterval]);
  return subtract(working, [...breaks, ...input.timeOff, ...input.blockedTimes]);
}

function sameInterval(a: Interval, b: Interval): boolean {
  return a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();
}

export function computeAvailableSlots(input: AvailabilityInput): Slot[] {
  const { localDate, timezone, now, settings, service } = input;

  const today = localDateString(now, timezone);
  if (!input.ignoreNotice) {
    if (compareDateStrings(localDate, today) < 0) return [];
    if (
      compareDateStrings(localDate, addDaysToDateString(today, settings.maxBookingAdvanceDays)) > 0
    )
      return [];
  }

  const bookings = input.exclude
    ? input.bookings.filter((b) => !sameInterval(b, input.exclude!))
    : input.bookings;
  const free = subtract(workingIntervals(input), normalize(bookings));

  const step = Math.max(5, settings.slotIntervalMinutes);
  const needed = service.durationMinutes + service.bufferMinutes;
  const earliest = input.ignoreNotice
    ? new Date(0)
    : addMinutes(now, settings.minBookingNoticeMinutes);

  const slots: Slot[] = [];
  for (const interval of free) {
    // Align the first candidate to the slot grid in local wall-clock minutes.
    const localMinutes = timeToMinutes(localTimeString(interval.start, timezone));
    const alignedMinutes = Math.ceil(localMinutes / step) * step;
    if (alignedMinutes >= 1440) continue;
    let start = wallClockToUtc(localDate, minutesToTime(alignedMinutes), timezone);
    if (start.getTime() < interval.start.getTime()) start = interval.start;

    while (addMinutes(start, needed).getTime() <= interval.end.getTime()) {
      if (start.getTime() >= earliest.getTime()) {
        slots.push({ startsAt: start, endsAt: addMinutes(start, service.durationMinutes) });
      }
      start = addMinutes(start, step);
    }
  }
  return slots;
}

/** True when a booking starting at `startsAt` fits exactly on an offered slot. */
export function isSlotAvailable(input: AvailabilityInput, startsAt: Date): boolean {
  return computeAvailableSlots(input).some((s) => s.startsAt.getTime() === startsAt.getTime());
}
