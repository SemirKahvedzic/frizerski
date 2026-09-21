import { z } from "zod";

import { routing } from "@/i18n/routing";
import { phoneSchema } from "@/modules/auth/schemas";

const name = (max: number) => z.string().trim().min(1, "auth.validation.required").max(max);

export const updateProfileSchema = z.object({
  firstName: name(60),
  lastName: name(60),
  phone: z
    .union([phoneSchema, z.literal("")])
    .optional()
    .transform((value) => (value ? value : null)),
  locale: z.enum(routing.locales),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  reminder24h: z.boolean(),
  reminder1h: z.boolean(),
  marketingEmails: z.boolean(),
});
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
