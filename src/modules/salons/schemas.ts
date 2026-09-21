import { z } from "zod";

import { imageRefSchema } from "@/modules/media/schemas";

import { routing } from "@/i18n/routing";
import { SLUG_PATTERN } from "@/lib/slug";
import {
  compareDateStrings,
  compareTimes,
  isValidDateString,
  isValidTime,
  WEEKDAYS,
} from "@/lib/time";

export const AUDIENCES = ["MALE", "FEMALE", "UNISEX"] as const;
export const SALON_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export const SALON_CATEGORIES = [
  "hair-salon",
  "barbershop",
  "beauty-salon",
  "nails",
  "spa",
  "other",
] as const;

/** Currencies offered in the UI; the column accepts any ISO 4217 code. */
export const SUPPORTED_CURRENCIES = ["BAM", "EUR", "CHF", "USD", "GBP", "RSD"] as const;

const supportedTimezones = new Set(Intl.supportedValuesOf("timeZone"));

export const timezoneSchema = z
  .string()
  .refine((value) => supportedTimezones.has(value), "salons.validation.timezone");

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "salons.validation.currency");

export const salonSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, "salons.validation.slug");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "salons.validation.tooLong")
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const optionalUrl = z
  .string()
  .trim()
  .max(300, "salons.validation.tooLong")
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || /^https?:\/\/\S+$/i.test(v), "salons.validation.url");

export const createSalonSchema = z.object({
  name: z.string().trim().min(2, "salons.validation.nameMin").max(80, "salons.validation.nameMax"),
  /** Optional; derived from the name when omitted. */
  slug: z.union([salonSlugSchema, z.literal("")]).optional(),
  audience: z.enum(AUDIENCES).default("UNISEX"),
  timezone: timezoneSchema.default("Europe/Sarajevo"),
  currency: currencySchema.default("BAM"),
  defaultLocale: z.enum(routing.locales).default(routing.defaultLocale),
});

export type CreateSalonInput = z.infer<typeof createSalonSchema>;

export const salonStatusSchema = z.enum(SALON_STATUSES);

export const updateSalonProfileSchema = z.object({
  logoImageId: imageRefSchema,
  coverImageId: imageRefSchema,
  name: z.string().trim().min(2, "salons.validation.nameMin").max(80, "salons.validation.nameMax"),
  description: optionalText(2000),
  category: z.enum(SALON_CATEGORIES).nullable().optional(),
  audience: z.enum(AUDIENCES),
  address: optionalText(200),
  city: optionalText(80),
  postalCode: optionalText(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()
    .refine((v) => v == null || /^[A-Z]{2}$/.test(v), "salons.validation.country"),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()
    .refine((v) => v == null || z.string().email().safeParse(v).success, "auth.validation.email"),
  website: optionalUrl,
  instagram: optionalUrl,
  facebook: optionalUrl,
  tiktok: optionalUrl,
  googleMapsUrl: optionalUrl,
  brandColor: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()
    .refine((v) => v == null || /^#[0-9a-fA-F]{6}$/.test(v), "salons.validation.color"),
  defaultLocale: z.enum(routing.locales),
});

export type UpdateSalonProfileInput = z.infer<typeof updateSalonProfileSchema>;

const int = (min: number, max: number) =>
  z.coerce.number().int().min(min, "salons.validation.range").max(max, "salons.validation.range");

/** HTML checkboxes send "on"/"true"/"1" or nothing; accept all of them. */
const bool = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (v === undefined || v === null || v === "") return false;
  if (typeof v === "string") return ["true", "on", "1", "yes"].includes(v.toLowerCase());
  return Boolean(v);
}, z.boolean());

export const updateSalonSettingsSchema = z.object({
  slotIntervalMinutes: int(5, 120),
  minBookingNoticeMinutes: int(0, 10080),
  maxBookingAdvanceDays: int(1, 365),
  cancellationCutoffHours: int(0, 720),
  rescheduleCutoffHours: int(0, 720),
  bufferMinutes: int(0, 120),
  autoConfirmBookings: bool,
  allowAnyEmployee: bool,
  allowGuestBooking: bool,
  requirePhone: bool,
  emailNotificationsEnabled: bool,
  pushNotificationsEnabled: bool,
  notifyAdminsOnNewBooking: bool,
  notifyEmployeeOnNewBooking: bool,
  reminder24hEnabled: bool,
  reminder1hEnabled: bool,
  timezone: timezoneSchema,
  currency: currencySchema,
});

export type UpdateSalonSettingsInput = z.infer<typeof updateSalonSettingsSchema>;

const timeSchema = z.string().refine(isValidTime, "salons.validation.time");

export const workingDaySchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    isClosed: bool,
    opensAt: timeSchema,
    closesAt: timeSchema,
  })
  .refine((d) => d.isClosed || compareTimes(d.closesAt, d.opensAt) > 0, {
    message: "salons.validation.closesAfterOpens",
    path: ["closesAt"],
  });

export const workingHoursSchema = z
  .array(workingDaySchema)
  .length(7, "salons.validation.sevenDays")
  .refine(
    (days) => WEEKDAYS.every((w) => days.some((d) => d.weekday === w)),
    "salons.validation.sevenDays",
  );

export type WorkingDayInput = z.infer<typeof workingDaySchema>;
export type WorkingHoursInput = z.infer<typeof workingHoursSchema>;

const dateSchema = z.string().refine(isValidDateString, "salons.validation.date");

export const createClosureSchema = z
  .object({
    startsOn: dateSchema,
    endsOn: dateSchema,
    reason: optionalText(200),
  })
  .refine((c) => compareDateStrings(c.endsOn, c.startsOn) >= 0, {
    message: "salons.validation.endAfterStart",
    path: ["endsOn"],
  });

export type CreateClosureInput = z.infer<typeof createClosureSchema>;
