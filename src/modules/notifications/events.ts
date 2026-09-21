import { z } from "zod";

/**
 * Outbox events as published to the queue. The payload is a hint: handlers
 * re-read the booking and treat the version as a staleness check
 * (docs/notifications.md §2).
 */
export type DomainEvent = {
  id: string;
  type: string;
  salonId: string | null;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  occurredAt: string;
};

const base = {
  bookingId: z.uuid(),
  version: z.number().int().min(1),
  actorUserId: z.string().nullable().optional(),
};

export const bookingEventPayloadSchemas = {
  "booking.created": z.object({
    ...base,
    status: z.enum(["PENDING", "CONFIRMED"]),
    employeeId: z.string(),
    customerId: z.string(),
  }),
  "booking.rescheduled": z.object({
    ...base,
    previousStartsAt: z.string(),
    newStartsAt: z.string(),
    previousEmployeeId: z.string(),
    newEmployeeId: z.string(),
    actor: z.string(),
  }),
  "booking.cancelled": z.object({
    ...base,
    cancelledBy: z.string(),
    reason: z.string().nullable().optional(),
  }),
  "booking.statusChanged": z.object({
    ...base,
    from: z.string(),
    to: z.string(),
  }),
} as const;

export type BookingEventType = keyof typeof bookingEventPayloadSchemas;

export type ParsedBookingEvent = {
  [K in BookingEventType]: { type: K; payload: z.infer<(typeof bookingEventPayloadSchemas)[K]> };
}[BookingEventType];

export function isBookingEventType(type: string): type is BookingEventType {
  return type in bookingEventPayloadSchemas;
}

/** Returns the typed event or `null` for unknown types / malformed payloads. */
export function parseBookingEvent(event: DomainEvent): ParsedBookingEvent | null {
  if (!isBookingEventType(event.type)) return null;
  const result = bookingEventPayloadSchemas[event.type].safeParse(event.payload);
  if (!result.success) return null;
  return { type: event.type, payload: result.data } as ParsedBookingEvent;
}
