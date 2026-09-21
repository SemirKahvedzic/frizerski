"use client";

import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { localeNames, routing, type AppLocale } from "@/i18n/routing";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t("language")}</span>
      <select
        aria-label={t("language")}
        className="rounded-md border bg-background px-2 py-1.5 text-sm"
        value={locale}
        onChange={(event) => router.replace(pathname, { locale: event.target.value as AppLocale })}
      >
        {routing.locales.map((code) => (
          <option key={code} value={code}>
            {localeNames[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
