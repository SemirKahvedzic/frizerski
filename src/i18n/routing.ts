import { defineRouting } from "next-intl/routing";

/**
 * Supported locales. Adding a language = add `messages/<locale>.json` and
 * one entry here (docs/architecture.md §8).
 */
export const routing = defineRouting({
  locales: ["bs", "en"],
  defaultLocale: "bs",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];

export const localeNames: Record<AppLocale, string> = {
  bs: "Bosanski",
  en: "English",
};
