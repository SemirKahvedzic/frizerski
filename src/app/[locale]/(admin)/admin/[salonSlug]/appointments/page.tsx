import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { AppointmentRow, type AppointmentRowData } from "@/components/admin/appointment-row";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { resolveLocaleParam } from "@/i18n/params";
import { localDateString, wallClockToUtc } from "@/lib/time";
import { allowedTransitions, listBookingsForSalon, addDaysToDateString } from "@/modules/booking";
import { getSalon } from "@/modules/salons";

import { getAdminContext } from "../_context";
import { changeBookingStatusAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/appointments">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("appointments") };
}

export default async function AppointmentsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/[salonSlug]/appointments">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const { range } = await searchParams;
  const ctx = await getAdminContext(locale, salonSlug);
  const salon = await getSalon(ctx);
  const now = new Date();
  const today = localDateString(now, salon.timezone);
  const past = range === "past";
  const from = past
    ? wallClockToUtc(addDaysToDateString(today, -30), "00:00", salon.timezone)
    : wallClockToUtc(today, "00:00", salon.timezone);
  const to = past
    ? wallClockToUtc(today, "00:00", salon.timezone)
    : wallClockToUtc(addDaysToDateString(today, 14), "00:00", salon.timezone);

  const [bookings, t, format] = await Promise.all([
    listBookingsForSalon(ctx, { from, to }),
    getTranslations("appointments"),
    getFormatter(),
  ]);
  const actorKind = ctx.role === "EMPLOYEE" ? "employee" : "staff";

  const groups = new Map<string, AppointmentRowData[]>();
  for (const b of bookings) {
    const key = localDateString(b.startsAt, salon.timezone);
    const list = groups.get(key) ?? [];
    list.push({ ...b, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString() });
    groups.set(key, list);
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        description={past ? t("subtitlePast") : t("subtitleUpcoming")}
        actions={
          <div className="flex gap-2 text-sm">
            <a
              href={`?range=upcoming`}
              className={!past ? "font-semibold underline" : "text-muted-foreground"}
            >
              {t("upcoming")}
            </a>
            <a
              href={`?range=past`}
              className={past ? "font-semibold underline" : "text-muted-foreground"}
            >
              {t("past")}
            </a>
          </div>
        }
      />
      {groups.size === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {format.dateTime(new Date(`${day}T12:00:00Z`), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
                {day === today ? ` · ${t("today")}` : ""}
              </h2>
              <ul className="divide-y rounded-xl border">
                {items.map((b) => (
                  <AppointmentRow
                    key={b.id}
                    salonSlug={salonSlug}
                    timezone={salon.timezone}
                    booking={b}
                    transitions={allowedTransitions(b.status, actorKind).filter(
                      (s): s is "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED" =>
                        s !== "PENDING",
                    )}
                    action={changeBookingStatusAction}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
