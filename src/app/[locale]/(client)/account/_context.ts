import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { UnauthenticatedError } from "@/lib/errors";
import { claimGuestCustomers } from "@/modules/account";
import { getCurrentActor, type Actor } from "@/modules/auth";

/**
 * Resolves the signed-in client for account pages or redirects to login with a
 * return path. Also links any guest bookings made with the same verified email.
 */
export async function requireClient(locale: AppLocale, path: string): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) {
    redirect({ href: { pathname: "/login", query: { next: `/${locale}${path}` } }, locale });
    throw new UnauthenticatedError(); // unreachable: redirect() throws
  }
  await claimGuestCustomers(actor);
  return actor;
}
