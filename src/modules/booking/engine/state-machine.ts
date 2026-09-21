/**
 * Booking status transitions per actor (docs/booking-system.md §6).
 */
export type BookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type ActorKind = "client" | "employee" | "staff" | "system";

const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingStatus, ActorKind[]>>> = {
  PENDING: { CONFIRMED: ["staff"], CANCELLED: ["client", "staff"] },
  CONFIRMED: {
    CANCELLED: ["client", "staff"],
    COMPLETED: ["staff", "employee"],
    NO_SHOW: ["staff", "employee"],
  },
  COMPLETED: { CONFIRMED: ["staff"] },
  NO_SHOW: { CONFIRMED: ["staff"] },
  CANCELLED: {},
};

export function canTransition(from: BookingStatus, to: BookingStatus, actor: ActorKind): boolean {
  if (actor === "system") return Boolean(TRANSITIONS[from][to]);
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function allowedTransitions(from: BookingStatus, actor: ActorKind): BookingStatus[] {
  return (Object.keys(TRANSITIONS[from]) as BookingStatus[]).filter((to) =>
    canTransition(from, to, actor),
  );
}

/** Statuses that occupy the employee's time (mirrors the DB exclusion constraint). */
export const ACTIVE_STATUSES: readonly BookingStatus[] = ["PENDING", "CONFIRMED"];
