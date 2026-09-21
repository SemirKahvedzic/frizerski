/**
 * Cancellation / reschedule policy (docs/booking-system.md §9). Pure so the
 * UI can show "cancel until …" with the same rule the server enforces.
 */
export type PolicyBooking = { status: string; startsAt: Date };

export type PolicyResult =
  | { ok: true; until: Date }
  | { ok: false; reason: "CUTOFF_PASSED" | "INVALID_STATUS"; until: Date };

const CLIENT_MUTABLE = new Set(["PENDING", "CONFIRMED"]);

function evaluate(booking: PolicyBooking, cutoffHours: number, now: Date): PolicyResult {
  const until = new Date(booking.startsAt.getTime() - cutoffHours * 3_600_000);
  if (!CLIENT_MUTABLE.has(booking.status)) return { ok: false, reason: "INVALID_STATUS", until };
  if (now.getTime() > until.getTime()) return { ok: false, reason: "CUTOFF_PASSED", until };
  return { ok: true, until };
}

export function canClientCancel(
  booking: PolicyBooking,
  settings: { cancellationCutoffHours: number },
  now: Date,
): PolicyResult {
  return evaluate(booking, settings.cancellationCutoffHours, now);
}

export function canClientReschedule(
  booking: PolicyBooking,
  settings: { rescheduleCutoffHours: number },
  now: Date,
): PolicyResult {
  return evaluate(booking, settings.rescheduleCutoffHours, now);
}
