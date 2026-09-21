import { CalendarX, Globe, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { OpeningHours } from "@/components/public/opening-hours";
import { PriceList } from "@/components/public/price-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { cacheTags } from "@/lib/cache/tags";
import { localDateString, localTimeString, weekdayInTimeZone } from "@/lib/time";
import { SALON_CATEGORIES, getPublicSalon } from "@/modules/salons";

/**
 * Public salon page. The read is cached per slug and invalidated by every
 * admin mutation (`updateTag`), so edits are visible immediately while
 * anonymous traffic never waits on the database.
 */
function loadSalon(slug: string, fromDate: string) {
  return unstable_cache(() => getPublicSalon(slug, fromDate), ["public-salon", slug, fromDate], {
    tags: [cacheTags.publicSalon(slug)],
    revalidate: 300,
  })();
}

async function loadSalonForRequest(slug: string) {
  // The "from" date only bounds the closure list; resolving it in UTC keeps the
  // cache key stable per day while every salon time zone is at most one day off.
  return loadSalon(slug, new Date().toISOString().slice(0, 10));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/salon/[slug]">): Promise<Metadata> {
  await resolveLocaleParam(params);
  const { slug } = await params;
  const salon = await loadSalonForRequest(slug);
  if (!salon) return {};
  const t = await getTranslations("publicSalon");
  return {
    title: salon.name,
    description: salon.description?.slice(0, 160) ?? t("metaFallback", { name: salon.name }),
    openGraph: {
      title: salon.name,
      description: salon.description?.slice(0, 160) ?? undefined,
      type: "website",
    },
  };
}

export default async function PublicSalonPage({ params }: PageProps<"/[locale]/salon/[slug]">) {
  await resolveLocaleParam(params);
  const { slug } = await params;
  const salon = await loadSalonForRequest(slug);
  if (!salon) notFound();

  const [t, common, format] = await Promise.all([
    getTranslations("publicSalon"),
    getTranslations("common"),
    getFormatter(),
  ]);
  const now = new Date();
  const todayWeekday = weekdayInTimeZone(now, salon.timezone);
  const today = localDateString(now, salon.timezone);
  const nowTime = localTimeString(now, salon.timezone);
  const todayHours = salon.workingHours.find((d) => d.weekday === todayWeekday);
  const closedToday = salon.closures.some((c) => c.startsOn <= today && c.endsOn >= today);
  const openNow = Boolean(
    todayHours &&
    !todayHours.isClosed &&
    !closedToday &&
    nowTime >= todayHours.opensAt &&
    nowTime < todayHours.closesAt,
  );
  const addressLine = [salon.address, [salon.postalCode, salon.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const categoryKey = SALON_CATEGORIES.find((c) => c === salon.category);
  const dateLabel = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <main
      className="flex flex-1 flex-col"
      style={
        salon.brandColor ? ({ "--primary": salon.brandColor } as React.CSSProperties) : undefined
      }
    >
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {common("appName")}
        </Link>
        <LocaleSwitcher />
      </header>

      <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
        <div className="rounded-2xl border bg-muted/40 p-6 sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={openNow ? "default" : "secondary"} data-testid="open-now">
              {openNow ? t("openNow") : t("closedNow")}
            </Badge>
            <Badge variant="outline">{t(`audience.${salon.audience}`)}</Badge>
            {categoryKey ? <Badge variant="outline">{t(`categories.${categoryKey}`)}</Badge> : null}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">{salon.name}</h1>
          {salon.description ? (
            <p
              className="mt-4 max-w-3xl text-base whitespace-pre-line text-muted-foreground sm:text-lg"
              data-testid="salon-description"
            >
              {salon.description}
            </p>
          ) : null}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" disabled>
              {t("bookSoon")}
            </Button>
            {salon.phone ? (
              <Button
                size="lg"
                variant="outline"
                render={<a href={`tel:${salon.phone.replace(/\s+/g, "")}`} />}
              >
                <Phone aria-hidden /> {salon.phone}
              </Button>
            ) : null}
          </div>
        </div>

        {salon.services.length > 0 ? (
          <section className="mt-8" data-testid="public-services">
            <h2 className="text-xl font-semibold tracking-tight">{t("services")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("servicesHint")}</p>
            <div className="mt-4">
              <PriceList services={salon.services} categories={salon.categories} />
            </div>
          </section>
        ) : null}

        {salon.employees.length > 0 ? (
          <section className="mt-8" data-testid="public-team">
            <h2 className="text-xl font-semibold tracking-tight">{t("team")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("teamHint")}</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {salon.employees.map((e) => (
                <li key={e.id} className="flex items-start gap-3 rounded-xl border bg-card p-4">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: e.color ?? "#475569" }}
                    aria-hidden
                  >
                    {e.firstName.charAt(0)}
                    {e.lastName.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium">
                      {e.firstName} {e.lastName}
                    </div>
                    {e.position ? (
                      <div className="text-xs text-muted-foreground">{e.position}</div>
                    ) : null}
                    {e.bio ? (
                      <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{e.bio}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>{t("openingHours")}</CardTitle>
            </CardHeader>
            <CardContent>
              <OpeningHours days={salon.workingHours} todayWeekday={todayWeekday} />
              {salon.closures.length > 0 ? (
                <div className="mt-4 rounded-lg border p-3 text-sm" data-testid="closures">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <CalendarX className="size-4" aria-hidden /> {t("closures")}
                  </div>
                  <ul className="space-y-1 text-muted-foreground">
                    {salon.closures.map((c) => (
                      <li key={c.id}>
                        {c.startsOn === c.endsOn
                          ? dateLabel(c.startsOn)
                          : `${dateLabel(c.startsOn)} – ${dateLabel(c.endsOn)}`}
                        {c.reason ? ` · ${c.reason}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("contact")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                {addressLine ? (
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <dt className="text-muted-foreground">{t("address")}</dt>
                      <dd data-testid="salon-address">
                        {salon.googleMapsUrl ? (
                          <a
                            href={salon.googleMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {addressLine}
                          </a>
                        ) : (
                          addressLine
                        )}
                      </dd>
                    </div>
                  </div>
                ) : null}
                {salon.phone ? (
                  <div className="flex gap-3">
                    <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <dt className="text-muted-foreground">{t("phone")}</dt>
                      <dd data-testid="salon-phone">{salon.phone}</dd>
                    </div>
                  </div>
                ) : null}
                {salon.email ? (
                  <div className="flex gap-3">
                    <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <dt className="text-muted-foreground">{t("email")}</dt>
                      <dd>
                        <a href={`mailto:${salon.email}`} className="hover:underline">
                          {salon.email}
                        </a>
                      </dd>
                    </div>
                  </div>
                ) : null}
                {salon.website ? (
                  <div className="flex gap-3">
                    <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <dt className="text-muted-foreground">{t("website")}</dt>
                      <dd>
                        <a
                          href={salon.website}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {salon.website.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </div>
                  </div>
                ) : null}
              </dl>
              {salon.instagram || salon.facebook || salon.tiktok ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  {salon.instagram ? (
                    <Button
                      variant="outline"
                      size="sm"
                      render={<a href={salon.instagram} target="_blank" rel="noreferrer" />}
                    >
                      Instagram
                    </Button>
                  ) : null}
                  {salon.facebook ? (
                    <Button
                      variant="outline"
                      size="sm"
                      render={<a href={salon.facebook} target="_blank" rel="noreferrer" />}
                    >
                      Facebook
                    </Button>
                  ) : null}
                  {salon.tiktok ? (
                    <Button
                      variant="outline"
                      size="sm"
                      render={<a href={salon.tiktok} target="_blank" rel="noreferrer" />}
                    >
                      TikTok
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-6 text-xs text-muted-foreground">
                {t("cancellationPolicy", { hours: salon.booking.cancellationCutoffHours })}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
