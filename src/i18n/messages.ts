import { createTranslator } from "next-intl";

import { routing, type AppLocale } from "@/i18n/routing";

type Messages = typeof import("../../messages/en.json");

const cache = new Map<AppLocale, Messages>();

/** Loads the message catalog for a locale (used outside React, e.g. emails). */
export async function loadMessages(locale: AppLocale): Promise<Messages> {
  const cached = cache.get(locale);
  if (cached) return cached;
  const messages = (await import(`../../messages/${locale}.json`)).default as Messages;
  cache.set(locale, messages);
  return messages;
}

export function normalizeLocale(value: string | null | undefined): AppLocale {
  return routing.locales.includes(value as AppLocale)
    ? (value as AppLocale)
    : routing.defaultLocale;
}

/** Translator usable in server code that runs outside a request (worker, emails). */
export async function getTranslator(locale: AppLocale) {
  const messages = await loadMessages(locale);
  return createTranslator({ locale, messages });
}
