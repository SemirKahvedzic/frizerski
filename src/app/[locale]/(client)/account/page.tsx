import { BadgeCheck, CalendarPlus, Plus, ShieldAlert, Store } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ResendVerificationButton } from "@/components/auth/resend-verification-button";
import { BookingCard } from "@/components/booking/booking-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { listBookingsForUser } from "@/modules/booking";
import { listSalonsForActor } from "@/modules/salons";

import { requireClient } from "./_context";

const ROLE_KEYS = {
  OWNER: "roles.OWNER",
  ADMIN: "roles.ADMIN",
  EMPLOYEE: "roles.EMPLOYEE",
} as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title") };
}

export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const locale = await resolveLocaleParam(params);
  const actor = await requireClient(locale, "/account");

  const [t, salons, upcoming] = await Promise.all([
    getTranslations("account"),
    listSalonsForActor(actor),
    listBookingsForUser(actor.userId, "upcoming"),
  ]);
  const next = upcoming[0];

  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">
        {t("welcome", { name: actor.name })}
      </h1>

      {!actor.emailVerified ? (
        <Alert className="mt-6">
          <ShieldAlert aria-hidden />
          <AlertDescription className="flex flex-col gap-3">
            <span>{t("verifyBanner")}</span>
            <ResendVerificationButton
              email={actor.email}
              label={t("resendVerification")}
              variant="secondary"
            />
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="mt-8" data-testid="next-booking">
        <CardHeader>
          <CardTitle>{t("overview.nextBooking")}</CardTitle>
          <CardDescription>
            {next
              ? t("overview.upcomingCount", { count: upcoming.length })
              : t("overview.noUpcoming")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {next ? (
            <BookingCard booking={{ ...next, startsAt: next.startsAt.toISOString() }} showSalon />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" render={<Link href="/account/bookings" />}>
              <CalendarPlus aria-hidden />
              {t("overview.viewAll")}
            </Button>
            <Button size="sm" variant="outline" render={<Link href="/" />}>
              {t("overview.findSalon")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("email")}</CardTitle>
            <CardDescription>{actor.email}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm">
            {actor.emailVerified ? (
              <>
                <BadgeCheck className="size-4 text-emerald-600" aria-hidden />
                <span>{t("verified")}</span>
              </>
            ) : (
              <>
                <ShieldAlert className="size-4 text-destructive" aria-hidden />
                <span>{t("notVerified")}</span>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("memberships")}</CardTitle>
            <CardDescription>
              {actor.platformRole === "SUPER_ADMIN" ? t("platformAdmin") : t("membershipsHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {salons.length === 0 ? (
              <p className="text-muted-foreground">{t("noMemberships")}</p>
            ) : (
              <ul className="space-y-2">
                {salons.map((salon) => (
                  <li key={salon.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/admin/${salon.slug}`}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <Store className="size-4 text-muted-foreground" aria-hidden />
                      {salon.name}
                    </Link>
                    <Badge variant="secondary">{t(ROLE_KEYS[salon.role])}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" render={<Link href="/account/salons/new" />}>
                <Plus aria-hidden />
                {t("createSalon")}
              </Button>
              {actor.platformRole === "SUPER_ADMIN" ? (
                <Button size="sm" variant="ghost" render={<Link href="/platform/salons" />}>
                  {t("openPlatform")}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
