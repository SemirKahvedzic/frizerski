import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { BlockedTimesPanel } from "@/components/admin/blocked-times-panel";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { listBlockedTimes, listEmployees, listTimeOff } from "@/modules/employees";
import { getSalon } from "@/modules/salons";

import { getAdminContext } from "../_context";
import { addBlockedTimeAction, removeBlockedTimeAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/availability">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("availability") };
}

export default async function AvailabilityPage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/availability">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const now = new Date();
  const [salon, employees, blocked, timeOff, t, tTimeOff, format] = await Promise.all([
    getSalon(ctx),
    listEmployees(ctx, { includeInactive: true }),
    listBlockedTimes(ctx, { from: now }),
    listTimeOff(ctx, { from: now }),
    getTranslations("availability"),
    getTranslations("employees.timeOff"),
    getFormatter(),
  ]);
  const names = employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }));
  const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle", { timezone: salon.timezone })} />
      <div className="space-y-6">
        <BlockedTimesPanel
          salonSlug={salonSlug}
          timezone={salon.timezone}
          employees={names}
          items={blocked.map((b) => ({
            ...b,
            startsAt: b.startsAt.toISOString(),
            endsAt: b.endsAt.toISOString(),
          }))}
          addAction={addBlockedTimeAction}
          removeAction={removeBlockedTimeAction}
        />
        <Card>
          <CardHeader>
            <CardTitle>{t("timeOff.title")}</CardTitle>
            <CardDescription>{t("timeOff.hint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {timeOff.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("timeOff.empty")}</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {timeOff.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/${salonSlug}/employees/${item.employeeId}`}
                        className="font-medium hover:underline"
                      >
                        {nameOf(item.employeeId)}
                      </Link>
                      <Badge variant="secondary">{tTimeOff(`types.${item.type}`)}</Badge>
                      <span>
                        {format.dateTime(item.startsAt, {
                          dateStyle: "medium",
                          timeZone: salon.timezone,
                        })}{" "}
                        –{" "}
                        {format.dateTime(new Date(item.endsAt.getTime() - 1), {
                          dateStyle: "medium",
                          timeZone: salon.timezone,
                        })}
                      </span>
                    </div>
                    {item.reason ? (
                      <span className="text-muted-foreground">{item.reason}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
