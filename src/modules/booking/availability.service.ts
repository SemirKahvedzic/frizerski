import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { dateStringToUtc, utcToDateString, wallClockToUtc } from "@/lib/time";
import {
  addDaysToDateString,
  computeAvailableSlots,
  rankCandidates,
  unionSlots,
  type AvailabilityInput,
  type Interval,
  type Slot,
  type UnionSlot,
} from "@/modules/booking/engine";

/**
 * Loads everything the pure engine needs for a set of employees over a date
 * range in one round of indexed queries, then answers per-day questions
 * without touching the database again (docs/booking-system.md §7).
 */
export type DbLike = Prisma.TransactionClient | typeof prisma;

export type EmployeeContext = {
  id: string;
  sortOrder: number;
  schedule: {
    weekday: number;
    startTime: string;
    endTime: string;
    breaks: { startTime: string; endTime: string }[];
  }[];
  timeOff: Interval[];
  blockedTimes: Interval[];
  bookings: Interval[];
};

export type AvailabilityContext = {
  salonId: string;
  timezone: string;
  settings: {
    slotIntervalMinutes: number;
    minBookingNoticeMinutes: number;
    maxBookingAdvanceDays: number;
    bufferMinutes: number;
  };
  salonHours: { weekday: number; isClosed: boolean; opensAt: string; closesAt: string }[];
  salonClosures: { startsOn: string; endsOn: string }[];
  service: {
    id: string;
    durationMinutes: number;
    bufferAfterMinutes: number;
    providerIds: string[];
  };
  employees: EmployeeContext[];
  salonBlockedTimes: Interval[];
};

export async function loadAvailabilityContext(
  db: DbLike,
  params: {
    salonId: string;
    serviceId: string;
    employeeIds?: string[];
    fromDate: string;
    toDate: string;
  },
): Promise<AvailabilityContext> {
  const salon = await db.salon.findUnique({
    where: { id: params.salonId },
    select: {
      id: true,
      timezone: true,
      settings: {
        select: {
          slotIntervalMinutes: true,
          minBookingNoticeMinutes: true,
          maxBookingAdvanceDays: true,
          bufferMinutes: true,
        },
      },
      workingHours: { select: { weekday: true, isClosed: true, opensAt: true, closesAt: true } },
    },
  });
  if (!salon) throw new NotFoundError("Salon");

  const service = await db.service.findFirst({
    where: { id: params.serviceId, salonId: params.salonId, isActive: true },
    select: {
      id: true,
      durationMinutes: true,
      bufferAfterMinutes: true,
      employees: { select: { employeeId: true } },
    },
  });
  if (!service) throw new NotFoundError("Service");
  const providerIds = service.employees.map((e) => e.employeeId);

  const wanted = params.employeeIds
    ? providerIds.filter((id) => params.employeeIds!.includes(id))
    : providerIds;
  const rangeStart = wallClockToUtc(
    addDaysToDateString(params.fromDate, -1),
    "00:00",
    salon.timezone,
  );
  const rangeEnd = wallClockToUtc(addDaysToDateString(params.toDate, 2), "00:00", salon.timezone);

  const [employees, closures, salonBlocked] = await Promise.all([
    wanted.length === 0
      ? Promise.resolve([])
      : db.employee.findMany({
          where: { salonId: params.salonId, id: { in: wanted }, isActive: true },
          select: {
            id: true,
            sortOrder: true,
            schedules: {
              where: { validFrom: null, validUntil: null },
              select: {
                weekday: true,
                startTime: true,
                endTime: true,
                breaks: { select: { startTime: true, endTime: true } },
              },
            },
            timeOff: {
              where: { startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
              select: { startsAt: true, endsAt: true },
            },
            bookings: {
              where: {
                status: { in: ["PENDING", "CONFIRMED"] },
                startsAt: { lt: rangeEnd },
                endsAt: { gt: rangeStart },
              },
              select: { startsAt: true, endsAt: true },
            },
          },
        }),
    db.salonClosure.findMany({
      where: {
        salonId: params.salonId,
        endsOn: { gte: dateStringToUtc(params.fromDate) },
        startsOn: { lte: dateStringToUtc(params.toDate) },
      },
      select: { startsOn: true, endsOn: true },
    }),
    db.blockedTime.findMany({
      where: { salonId: params.salonId, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
      select: { employeeId: true, startsAt: true, endsAt: true },
    }),
  ]);

  const toInterval = (r: { startsAt: Date; endsAt: Date }): Interval => ({
    start: r.startsAt,
    end: r.endsAt,
  });
  const salonBlockedTimes = salonBlocked.filter((b) => b.employeeId === null).map(toInterval);

  return {
    salonId: salon.id,
    timezone: salon.timezone,
    settings: salon.settings ?? {
      slotIntervalMinutes: 30,
      minBookingNoticeMinutes: 60,
      maxBookingAdvanceDays: 60,
      bufferMinutes: 0,
    },
    salonHours: salon.workingHours,
    salonClosures: closures.map((c) => ({
      startsOn: utcToDateString(c.startsOn),
      endsOn: utcToDateString(c.endsOn),
    })),
    service: {
      id: service.id,
      durationMinutes: service.durationMinutes,
      bufferAfterMinutes: service.bufferAfterMinutes,
      providerIds,
    },
    employees: employees.map((e) => ({
      id: e.id,
      sortOrder: e.sortOrder,
      schedule: e.schedules,
      timeOff: e.timeOff.map(toInterval),
      blockedTimes: [
        ...salonBlockedTimes,
        ...salonBlocked.filter((b) => b.employeeId === e.id).map(toInterval),
      ],
      bookings: e.bookings.map(toInterval),
    })),
    salonBlockedTimes,
  };
}

export function engineInput(
  context: AvailabilityContext,
  employee: EmployeeContext,
  localDate: string,
  now: Date,
  options: { exclude?: Interval; ignoreNotice?: boolean } = {},
): AvailabilityInput {
  return {
    localDate,
    timezone: context.timezone,
    now,
    salonHours: context.salonHours,
    salonClosures: context.salonClosures,
    schedule: employee.schedule,
    timeOff: employee.timeOff,
    blockedTimes: employee.blockedTimes,
    bookings: employee.bookings,
    service: {
      durationMinutes: context.service.durationMinutes,
      bufferMinutes: context.service.bufferAfterMinutes + context.settings.bufferMinutes,
    },
    settings: context.settings,
    exclude: options.exclude,
    ignoreNotice: options.ignoreNotice,
  };
}

export function slotsForEmployee(
  context: AvailabilityContext,
  employeeId: string,
  localDate: string,
  now: Date,
  options?: { exclude?: Interval; ignoreNotice?: boolean },
): Slot[] {
  const employee = context.employees.find((e) => e.id === employeeId);
  if (!employee) return [];
  return computeAvailableSlots(engineInput(context, employee, localDate, now, options));
}

export function slotsForAnyEmployee(
  context: AvailabilityContext,
  localDate: string,
  now: Date,
): UnionSlot[] {
  return unionSlots(
    context.employees.map((e) => ({
      employeeId: e.id,
      slots: computeAvailableSlots(engineInput(context, e, localDate, now)),
    })),
  );
}

/** Preference order for "any employee" at a given start. */
export function candidatesFor(
  context: AvailabilityContext,
  localDate: string,
  startsAt: Date,
  now: Date,
): string[] {
  const dayStart = wallClockToUtc(localDate, "00:00", context.timezone);
  const dayEnd = wallClockToUtc(addDaysToDateString(localDate, 1), "00:00", context.timezone);
  const eligible = context.employees.filter((e) =>
    computeAvailableSlots(engineInput(context, e, localDate, now)).some(
      (s) => s.startsAt.getTime() === startsAt.getTime(),
    ),
  );
  return rankCandidates(
    eligible.map((e) => ({
      employeeId: e.id,
      sortOrder: e.sortOrder,
      bookingsThatDay: e.bookings.filter(
        (b) => b.start.getTime() >= dayStart.getTime() && b.start.getTime() < dayEnd.getTime(),
      ).length,
    })),
  );
}

/** Per-day availability flags for a date picker. */
export function daysWithSlots(
  context: AvailabilityContext,
  fromDate: string,
  toDate: string,
  employeeId: string | "any",
  now: Date,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (let d = fromDate; d <= toDate; d = addDaysToDateString(d, 1)) {
    out[d] =
      employeeId === "any"
        ? slotsForAnyEmployee(context, d, now).length > 0
        : slotsForEmployee(context, employeeId, d, now).length > 0;
  }
  return out;
}
