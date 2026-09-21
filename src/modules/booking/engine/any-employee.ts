import type { Slot } from "@/modules/booking/engine/availability";

export type EmployeeSlots = { employeeId: string; slots: Slot[] };

export type UnionSlot = Slot & { employeeIds: string[] };

/** Union of per-employee slots keyed by start time, sorted. */
export function unionSlots(perEmployee: EmployeeSlots[]): UnionSlot[] {
  const byStart = new Map<number, UnionSlot>();
  for (const { employeeId, slots } of perEmployee) {
    for (const slot of slots) {
      const key = slot.startsAt.getTime();
      const existing = byStart.get(key);
      if (existing) {
        existing.employeeIds.push(employeeId);
      } else {
        byStart.set(key, {
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          employeeIds: [employeeId],
        });
      }
    }
  }
  return [...byStart.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export type Candidate = { employeeId: string; bookingsThatDay: number; sortOrder: number };

/**
 * Deterministic "any employee" choice: fewest bookings that day, then lowest
 * sort order, then id. Returns candidates in preference order so the caller
 * can fall through when the first one loses a race.
 */
export function rankCandidates(candidates: Candidate[]): string[] {
  return [...candidates]
    .sort(
      (a, b) =>
        a.bookingsThatDay - b.bookingsThatDay ||
        a.sortOrder - b.sortOrder ||
        a.employeeId.localeCompare(b.employeeId),
    )
    .map((c) => c.employeeId);
}
