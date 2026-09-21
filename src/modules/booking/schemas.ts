import { z } from "zod";

import { isValidDateString } from "@/lib/time";

export const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export const dateStringSchema = z.string().refine(isValidDateString, "salons.validation.date");

export const availabilityQuerySchema = z.object({
  serviceId: z.uuid(),
  employeeId: z.union([z.uuid(), z.literal("any")]).default("any"),
  date: dateStringSchema,
});

export const availabilitySummaryQuerySchema = z.object({
  serviceId: z.uuid(),
  employeeId: z.union([z.uuid(), z.literal("any")]).default("any"),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "salons.validation.date"),
});

export const guestCustomerSchema = z.object({
  firstName: z.string().trim().min(1, "auth.validation.required").max(60),
  lastName: z.string().trim().min(1, "auth.validation.required").max(60),
  email: z.string().trim().toLowerCase().email("auth.validation.email"),
  phone: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()
    .refine((v) => v == null || /^\+?[0-9 ()-]{6,20}$/.test(v), "auth.validation.phone"),
});

export const createPublicBookingSchema = z.object({
  serviceId: z.uuid(),
  employeeId: z.union([z.uuid(), z.literal("any")]),
  startsAt: z.coerce.date(),
  customer: guestCustomerSchema.optional(),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
  locale: z.string().min(2).max(5).optional(),
});

export type CreatePublicBookingInput = z.infer<typeof createPublicBookingSchema>;

export const createAdminBookingSchema = z.object({
  serviceId: z.uuid(),
  employeeId: z.uuid(),
  startsAt: z.coerce.date(),
  customerId: z.uuid().optional(),
  customer: guestCustomerSchema.optional(),
  source: z.enum(["ADMIN", "WALK_IN"]).default("ADMIN"),
  internalNotes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : null)),
  status: z.enum(["PENDING", "CONFIRMED"]).default("CONFIRMED"),
});

export type CreateAdminBookingInput = z.infer<typeof createAdminBookingSchema>;

export const rescheduleSchema = z.object({
  startsAt: z.coerce.date(),
  employeeId: z.uuid().optional(),
  version: z.coerce.number().int().positive(),
});

export const cancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
  version: z.coerce.number().int().positive(),
});

export const changeStatusSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
  version: z.coerce.number().int().positive(),
});

export const listBookingsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  employeeId: z.uuid().optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  customerId: z.uuid().optional(),
});
