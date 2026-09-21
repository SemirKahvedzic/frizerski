import { getSessionCookie } from "better-auth/cookies";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";

/**
 * Next.js proxy (formerly middleware).
 *
 * 1. Locale negotiation (next-intl).
 * 2. Optimistic redirect of signed-out visitors away from account/admin areas.
 *    This only checks for the presence of the session cookie; real
 *    authorization happens in the page/route (docs/architecture.md §5).
 */
const intlMiddleware = createIntlMiddleware(routing);

const AUTH_COOKIE_PREFIX = "salon";
const PROTECTED_SEGMENTS = ["account", "admin", "platform"];

const localePattern = routing.locales.join("|");
const protectedPath = new RegExp(`^/(${localePattern})/(${PROTECTED_SEGMENTS.join("|")})(/|$)`);

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const match = pathname.match(protectedPath);

  if (match) {
    const hasSession = getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX });
    if (!hasSession) {
      const locale = match[1];
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Skip API routes, Next internals, and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
