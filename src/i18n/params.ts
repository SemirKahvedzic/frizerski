import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { routing, type AppLocale } from "@/i18n/routing";

/**
 * Narrows the `[locale]` route param to a supported locale, enables static
 * rendering for the request, and 404s for anything else.
 */
export async function resolveLocaleParam(params: Promise<{ locale: string }>): Promise<AppLocale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return locale;
}
