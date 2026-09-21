import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { CalendarView } from "@/components/calendar/calendar-view";
import { addDays, visibleRange } from "@/components/calendar/layout";
import type {
  CalendarBlock,
  CalendarBooking,
  CalendarData,
  CalendarView as View,
} from "@/components/calendar/types";
import { resolveLocaleParam } from "@/i18n/params";
import {
  isValidDateString,
  localDateString,
  localTimeString,
  timeToMinutes,
  wallClockToUtc,
} from "@/lib/time";
import { can } from "@/modules/auth";
import { listBookingsForSalon } from "@/modules/booking";
import { listBlockedTimes, listEmployees, listTimeOff } from "@/modules/employees";
import { getSalon, getWorkingHours } from "@/modules/salons";
import { listServices } from "@/modules/services";

import { getAdminContext } from "../_context";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/calendar">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("calendar") };
}

const minutesOf = (instant: Date, tz: string) => timeToMinutes(localTimeString(instant, tz));

export default async function CalendarPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/[salonSlug]/calendar">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const sp = await searchParams;
  const ctx = await getAdminContext(locale, salonSlug);
  const salon = await getSalon(ctx);
  const tz = salon.timezone;
  const now = new Date();
  const today = localDateString(now, tz);

  const view: View = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const date = typeof sp.date === "string" && isValidDateString(sp.date) ? sp.date : today;
  const employeeFilter =
    typeof sp.employee === "string" && sp.employee.length > 0 ? sp.employee : null;
  const range = visibleRange(date, view);
  const from = wallClockToUtc(range.from, "00:00", tz);
  const to = wallClockToUtc(addDays(range.to, 1), "00:00", tz);

  const [employees, services, hours, bookings, blocked, timeOff, t] = await Promise.all([
    listEmployees(ctx),
    listServices(ctx),
    getWorkingHours(ctx),
    listBookingsForSalon(ctx, { from, to, employeeId: employeeFilter ?? undefined }),
    listBlockedTimes(ctx, { from, to }),
    listTimeOff(ctx, { from }),
    getTranslations("calendar"),
  ]);

  const openDays = hours.filter((h) => !h.isClosed);
  const dayStartMin = Math.max(
    0,
    Math.min(...openDays.map((h) => timeToMinutes(h.opensAt)), 9 * 60) - 60,
  );
  const dayEndMin = Math.min(
    24 * 60,
    Math.max(...openDays.map((h) => timeToMinutes(h.closesAt)), 17 * 60) + 60,
  );

  const items: (CalendarBooking | CalendarBlock)[] = bookings.map((b) => ({
    kind: "booking",
    id: b.id,
    date: localDateString(b.startsAt, tz),
    startMin: minutesOf(b.startsAt, tz),
    endMin: Math.max(minutesOf(b.startsAt, tz) + 15, minutesOf(b.endsAt, tz)),
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    status: b.status,
    version: b.version,
    source: b.source,
    employeeId: b.employee.id,
    employeeName: `${b.employee.firstName} ${b.employee.lastName}`,
    color: b.employee.color,
    customerName: `${b.customer.firstName} ${b.customer.lastName}`,
    customerEmail: b.customer.email,
    customerPhone: b.customer.phone,
    serviceId: b.service.id,
    serviceName: b.service.name,
    durationMinutes: b.durationMinutes,
    priceCents: b.priceCents,
    currency: b.currency,
    clientNotes: b.clientNotes,
    internalNotes: b.internalNotes,
  }));

  // Expand blocks and absences per visible day, clipped to the day bounds.
  const expand = (
    kind: "blocked" | "timeoff",
    id: string,
    employeeId: string | null,
    startsAt: Date,
    endsAt: Date,
    label: string | null,
  ) => {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      const dayStart = wallClockToUtc(d, "00:00", tz);
      const dayEnd = wallClockToUtc(addDays(d, 1), "00:00", tz);
      if (endsAt <= dayStart || startsAt >= dayEnd) continue;
      const s = startsAt > dayStart ? minutesOf(startsAt, tz) : 0;
      const e = endsAt < dayEnd ? minutesOf(endsAt, tz) : 24 * 60;
      items.push({ kind, id: `${id}:${d}`, date: d, startMin: s, endMin: e, employeeId, label });
    }
  };
  for (const b of blocked)
    if (!employeeFilter || !b.employeeId || b.employeeId === employeeFilter)
      expand("blocked", b.id, b.employeeId, b.startsAt, b.endsAt, b.reason);
  for (const off of timeOff)
    if (!employeeFilter || off.employeeId === employeeFilter)
      expand(
        "timeoff",
        off.id,
        off.employeeId,
        off.startsAt,
        off.endsAt,
        off.reason ?? t("timeOff"),
      );

  const data: CalendarData = {
    salonId: ctx.salonId,
    salonSlug,
    timezone: tz,
    view,
    date,
    today,
    employeeFilter,
    dayStartMin,
    dayEndMin,
    employees: employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      color: e.color,
    })),
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      employeeIds: s.employeeIds,
    })),
    items,
    canManage: can(ctx.actor, "booking.update", { salonId: ctx.salonId }),
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle", { timezone: tz })} />
      <CalendarView data={data} />
    </>
  );
}
