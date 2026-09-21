import { z } from "zod";

import { imageRefSchema } from "@/modules/media/schemas";

import { parseMoneyToCents } from "@/lib/money";

export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "salons.validation.tooLong")
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const bool = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (v === undefined || v === null || v === "") return false;
  if (typeof v === "string") return ["true", "on", "1", "yes"].includes(v.toLowerCase());
  return Boolean(v);
}, z.boolean());

/** Accepts "20", "20.5", "20,50" or a number; yields cents. */
export const priceSchema = z.preprocess(
  (v) => (typeof v === "string" || typeof v === "number" ? parseMoneyToCents(v) : v),
  z
    .number()
    .int()
    .min(0, "services.validation.price")
    .max(100_000_000, "services.validation.price"),
);

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "auth.validation.required").max(60, "salons.validation.tooLong"),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const serviceInputSchema = z.object({
  name: z.string().trim().min(1, "auth.validation.required").max(80, "salons.validation.tooLong"),
  description: optionalText(1000),
  categoryId: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  priceCents: priceSchema,
  durationMinutes: z.coerce
    .number()
    .int()
    .min(5, "services.validation.duration")
    .max(600, "services.validation.duration"),
  bufferAfterMinutes: z.coerce.number().int().min(0).max(120, "salons.validation.range").default(0),
  audience: z.enum(["MALE", "FEMALE", "UNISEX"]).default("UNISEX"),
  isActive: bool.default(true),
  employeeIds: z.array(z.uuid()).default([]),
  imageId: imageRefSchema,
});

export type ServiceInput = z.infer<typeof serviceInputSchema>;

export const reorderSchema = z.object({ ids: z.array(z.uuid()).min(1) });
