import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { getPrisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/modules/notifications";

/** Prefix for all auth cookies (`salon.session_token`, …). */
export const AUTH_COOKIE_PREFIX = "salon";

const DAY = 60 * 60 * 24;

type UserLike = { email: string; name: string; locale?: string | null };

/**
 * Better Auth server instance (docs/architecture.md §7).
 *
 * - Email + password with verification and reset emails through our provider.
 * - Optional Google OAuth when credentials are configured.
 * - Database sessions with a short cookie cache.
 * - Application fields on `user` (names, phone, locale, platform role, active flag).
 *
 * `withNextCookies` is only enabled inside the Next.js runtime; the worker,
 * seed script and tests use the same configuration without it.
 */
export function createAuth(options: { withNextCookies: boolean }) {
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return betterAuth({
    appName: env.APP_NAME,
    baseURL: env.BETTER_AUTH_URL ?? env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // Clients may sign in before verifying; staff features require a verified
      // email (see requireVerifiedEmail).
      requireEmailVerification: false,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }: { user: UserLike; url: string }) => {
        await sendPasswordResetEmail({ to: user.email, name: user.name, locale: user.locale, url });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, url }: { user: UserLike; url: string }) => {
        await sendVerificationEmail({ to: user.email, name: user.name, locale: user.locale, url });
      },
    },

    user: {
      additionalFields: {
        firstName: { type: "string", required: false, input: true },
        lastName: { type: "string", required: false, input: true },
        phone: { type: "string", required: false, input: true },
        locale: { type: "string", required: false, input: true },
        platformRole: { type: "string", required: false, input: false },
        isActive: { type: "boolean", required: false, defaultValue: true, input: false },
      },
    },

    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      // Disabled on purpose: a signed cookie snapshot would keep revoked
      // sessions and deactivated users "signed in" until it expires. One
      // indexed session lookup per request is the price of immediate revocation.
      cookieCache: { enabled: false },
    },

    socialProviders: googleEnabled
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
          },
        }
      : {},

    rateLimit: {
      enabled: env.NODE_ENV !== "test",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 5 },
      },
    },

    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      database: { generateId: "uuid" },
    },

    plugins: options.withNextCookies ? [nextCookies()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __auth?: Auth };

/** Lazy singleton; created on first use so imports never touch the environment. */
export function getAuth(): Auth {
  if (!globalForAuth.__auth) {
    globalForAuth.__auth = createAuth({ withNextCookies: Boolean(process.env["NEXT_RUNTIME"]) });
  }
  return globalForAuth.__auth;
}

/** Test helper. */
export function resetAuth(): void {
  globalForAuth.__auth = undefined;
}
