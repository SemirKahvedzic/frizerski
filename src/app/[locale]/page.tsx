import { CalendarCheck, Clock, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { getCurrentActor } from "@/modules/auth";

const features = [
  { key: "booking", Icon: CalendarCheck },
  { key: "team", Icon: Users },
  { key: "reminders", Icon: Clock },
] as const;

export default async function LandingPage({ params }: PageProps<"/[locale]">) {
  await resolveLocaleParam(params);
  const [t, common, nav, actor] = await Promise.all([
    getTranslations("landing"),
    getTranslations("common"),
    getTranslations("nav"),
    getCurrentActor(),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="text-lg font-semibold tracking-tight">{common("appName")}</span>
        <nav className="flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher />
          {actor ? (
            <Button variant="outline" size="sm" render={<Link href="/account" />}>
              {nav("account")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" render={<Link href="/login" />}>
                {nav("login")}
              </Button>
              <Button size="sm" render={<Link href="/register" />}>
                {nav("register")}
              </Button>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
        <p className="mb-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">
          {t("status")}
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          {t("title")}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" render={<Link href={actor ? "/account" : "/register"} />}>
            {t("ctaPrimary")}
          </Button>
          <Button size="lg" variant="outline">
            {t("ctaSecondary")}
          </Button>
        </div>

        <ul className="mt-20 grid gap-6 sm:grid-cols-3">
          {features.map(({ key, Icon }) => (
            <li key={key} className="rounded-xl border bg-card p-6">
              <Icon className="mb-4 size-6 text-muted-foreground" aria-hidden />
              <h2 className="font-medium">{t(`features.${key}.title`)}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(`features.${key}.description`)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
