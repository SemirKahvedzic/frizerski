import { z } from "zod";

import { routing } from "@/i18n/routing";
import { SLUG_PATTERN } from "@/lib/slug";

export const AUDIENCES = ["MALE", "FEMALE", "UNISEX"] as const;
export const SALON_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

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
