import { z } from "zod";

/**
 * Form/API schemas. Messages are translation keys under `auth.validation`
 * so the same schema serves the client (translated) and the server.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const emailSchema = z.string().trim().toLowerCase().email("auth.validation.email");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "auth.validation.passwordMin")
  .max(128, "auth.validation.passwordMax");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,20}$/, "auth.validation.phone");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "auth.validation.required"),
});

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, "auth.validation.required").max(60),
    lastName: z.string().trim().min(1, "auth.validation.required").max(60),
    email: emailSchema,
    phone: z.union([phoneSchema, z.literal("")]).optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "auth.validation.passwordMatch",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "auth.validation.passwordMatch",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Only allow same-origin relative paths as post-login redirect targets. */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
