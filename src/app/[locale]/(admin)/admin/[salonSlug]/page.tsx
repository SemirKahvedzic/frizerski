import { ArrowRight, Clock, Settings, Store } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { getSalonProfile, getWorkingHours } from "@/modules/salons";

import { getAdminContext } from "./_context";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("dashboard") };
}

export default async function SalonDashboardPage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const [salon, hours, t] = await Promise.all([
    getSalonProfile(ctx),
    getWorkingHours(ctx),
    getTranslations("admin"),
  ]);

  const openDays = hours.filter((h) => !h.isClosed).length;
  const profileFields = [salon.description, salon.address, salon.phone, salon.email];
  const completeness = Math.round(
    (profileFields.filter(Boolean).length / profileFields.length) * 100,
  );
  const base = `/admin/${salon.slug}`;

  return (
    <>
      <PageHeader
        title={t("dashboard.title", { name: salon.name })}
        description={t("dashboard.subtitle")}
        actions={
          <Button variant="outline" render={<Link href={`/salon/${salon.slug}`} target="_blank" />}>
            {t("viewPublicPage")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t("dashboard.profileCompleteness")}</CardDescription>
            <CardTitle className="text-3xl">{completeness}%</CardTitle>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="ghost" render={<Link href={`${base}/salon`} />}>
              <Store aria-hidden /> {t("dashboard.editProfile")} <ArrowRight aria-hidden />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("dashboard.openDays")}</CardDescription>
            <CardTitle className="text-3xl">{openDays} / 7</CardTitle>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="ghost" render={<Link href={`${base}/working-hours`} />}>
              <Clock aria-hidden /> {t("dashboard.editHours")} <ArrowRight aria-hidden />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("dashboard.status")}</CardDescription>
            <CardTitle className="text-3xl">
              <Badge
                variant={salon.status === "ACTIVE" ? "default" : "destructive"}
                className="text-base"
              >
                {t(`status.${salon.status}`)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="ghost" render={<Link href={`${base}/settings`} />}>
              <Settings aria-hidden /> {t("dashboard.editSettings")} <ArrowRight aria-hidden />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("dashboard.nextSteps")}</CardTitle>
          <CardDescription>{t("dashboard.nextStepsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("dashboard.step1")}</li>
            <li>{t("dashboard.step2")}</li>
            <li>{t("dashboard.step3")}</li>
            <li>{t("dashboard.step4")}</li>
          </ol>
        </CardContent>
      </Card>
    </>
  );
}
