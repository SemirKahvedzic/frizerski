import { z } from "zod";

import { imageRefSchema } from "@/modules/media/schemas";

import { compareTimes, isValidDateString, isValidTime, WEEKDAYS } from "@/lib/time";

export const TIME_OFF_TYPES = ["VACATION", "SICK", "PERSONAL", "OTHER"] as const;

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

export const employeeInputSchema = z.object({
  firstName: z.string().trim().min(1, "auth.validation.required").max(60),
  lastName: z.string().trim().min(1, "auth.validation.required").max(60),
  position: optionalText(80),
  bio: optionalText(1000),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()
    .refine((v) => v == null || z.string().email().safeParse(v).success, "auth.validation.email"),
  phone: optionalText(30),
  avatarImageId: imageRefSchema,
  audience: z.enum(["MALE", "FEMALE", "UNISEX"]).default("UNISEX"),
  color: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()
    .refine((v) => v == null || /^#[0-9a-fA-F]{6}$/.test(v), "salons.validation.color"),
  isActive: bool.default(true),
  isBookableOnline: bool.default(true),
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;

const timeSchema = z.string().refine(isValidTime, "salons.validation.time");

export const breakInputSchema = z
  .object({ startTime: timeSchema, endTime: timeSchema, label: optionalText(60) })
  .refine((b) => compareTimes(b.endTime, b.startTime) > 0, {
    message: "salons.validation.closesAfterOpens",
    path: ["endTime"],
  });

export const scheduleBlockSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
    breaks: z.array(breakInputSchema).max(6).default([]),
  })
  .refine((b) => compareTimes(b.endTime, b.startTime) > 0, {
    message: "salons.validation.closesAfterOpens",
    path: ["endTime"],
  })
  .refine(
    (b) =>
      b.breaks.every(
        (br) =>
          compareTimes(br.startTime, b.startTime) >= 0 && compareTimes(br.endTime, b.endTime) <= 0,
      ),
    { message: "employees.validation.breakInsideShift", path: ["breaks"] },
  );

/** Whole weekly schedule: any number of blocks per weekday, non-overlapping. */
export const scheduleInputSchema = z
  .array(scheduleBlockSchema)
  .max(21)
  .refine(
    (blocks) =>
      WEEKDAYS.every((w) => {
        const day = blocks
          .filter((b) => b.weekday === w)
          .sort((a, b) => compareTimes(a.startTime, b.startTime));
        return day.every((b, i) => i === 0 || compareTimes(b.startTime, day[i - 1]!.endTime) >= 0);
      }),
    "employees.validation.blocksOverlap",
  );

export type ScheduleBlockInput = z.infer<typeof scheduleBlockSchema>;
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

const dateSchema = z.string().refine(isValidDateString, "salons.validation.date");

/**
 * Time off is entered as local dates (all day) or local date + times.
 * Conversion to UTC happens in the service using the salon time zone.
 */
export const timeOffInputSchema = z
  .object({
    type: z.enum(TIME_OFF_TYPES).default("VACATION"),
    startsOn: dateSchema,
    endsOn: dateSchema,
    allDay: bool.default(true),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    reason: optionalText(200),
  })
  .refine((t) => t.endsOn >= t.startsOn, {
    message: "salons.validation.endAfterStart",
    path: ["endsOn"],
  })
  .refine(
    (t) => t.allDay || (t.startTime && t.endTime && compareTimes(t.endTime, t.startTime) > 0),
    {
      message: "salons.validation.closesAfterOpens",
      path: ["endTime"],
    },
  );

export type TimeOffInput = z.infer<typeof timeOffInputSchema>;

export const blockedTimeInputSchema = z
  .object({
    employeeId: z.union([z.uuid(), z.literal("")]).optional(),
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    reason: optionalText(200),
  })
  .refine((b) => compareTimes(b.endTime, b.startTime) > 0, {
    message: "salons.validation.closesAfterOpens",
    path: ["endTime"],
  });

export type BlockedTimeInput = z.infer<typeof blockedTimeInputSchema>;

export const inviteEmployeeSchema = z.object({
  email: z.string().trim().toLowerCase().email("auth.validation.email"),
});
