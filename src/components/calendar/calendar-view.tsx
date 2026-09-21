"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { BookingDrawer } from "@/components/calendar/booking-drawer";
import { assignColumns, monthGrid, percent, shiftDate, weekOf } from "@/components/calendar/layout";
import { NewBookingSheet } from "@/components/calendar/new-booking-sheet";
import type {
  CalendarBooking,
  CalendarData,
  CalendarView as View,
} from "@/components/calendar/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<CalendarBooking["status"], string> = {
  PENDING: "border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
  CONFIRMED:
    "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100",
  COMPLETED: "border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  CANCELLED: "border-rose-300 bg-rose-50 text-rose-800 line-through opacity-70 dark:bg-rose-950/30",
  NO_SHOW: "border-rose-500 bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
};

const minutesLabel = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function CalendarView({ data }: { data: CalendarData }) {
  const t = useTranslations("calendar");
  const format = useFormatter();
  const router = useRouter();
  const [selected, setSelected] = useState<CalendarBooking | null>(null);
  const [creating, setCreating] = useState<{
    date: string;
    employeeId: string | null;
    startMin: number | null;
  } | null>(null);

  const base = `/admin/${data.salonSlug}/calendar`;
  const navigate = (patch: Partial<{ view: View; date: string; employee: string | null }>) => {
    const view = patch.view ?? data.view;
    const date = patch.date ?? data.date;
    const employee = patch.employee === undefined ? data.employeeFilter : patch.employee;
    const params = new URLSearchParams({ view, date });
    if (employee) params.set("employee", employee);
    router.push(`${base}?${params.toString()}`);
  };

  const employees = data.employeeFilter
    ? data.employees.filter((e) => e.id === data.employeeFilter)
    : data.employees;
  const bookings = data.items.filter((i): i is CalendarBooking => i.kind === "booking");
  const heading =
    data.view === "day"
      ? format.dateTime(new Date(`${data.date}T12:00:00Z`), {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : data.view === "week"
        ? `${format.dateTime(new Date(`${weekOf(data.date)[0]}T12:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" })} – ${format.dateTime(new Date(`${weekOf(data.date)[6]}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
        : format.dateTime(new Date(`${data.date.slice(0, 7)}-15T12:00:00Z`), {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          });

  return (
    <div className="space-y-4" data-testid="calendar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            aria-label={t("previous")}
            onClick={() => navigate({ date: shiftDate(data.date, data.view, -1) })}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label={t("next")}
            onClick={() => navigate({ date: shiftDate(data.date, data.view, 1) })}
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate({ date: data.today })}>
            {t("today")}
          </Button>
        </div>
        <h2
          className="min-w-0 flex-1 truncate text-lg font-semibold"
          data-testid="calendar-heading"
        >
          {heading}
        </h2>
        <div
          className="flex items-center gap-1 rounded-lg border p-0.5"
          role="tablist"
          aria-label={t("view")}
        >
          {(["day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={data.view === v}
              onClick={() => navigate({ view: v })}
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                data.view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {t(`views.${v}`)}
            </button>
          ))}
        </div>
        <select
          aria-label={t("employeeFilter")}
          value={data.employeeFilter ?? ""}
          onChange={(e) => navigate({ employee: e.target.value || null })}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="">{t("allEmployees")}</option>
          {data.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        {data.canManage ? (
          <Button
            onClick={() =>
              setCreating({
                date: data.view === "month" ? data.today : data.date,
                employeeId: data.employeeFilter,
                startMin: null,
              })
            }
            data-testid="new-booking"
          >
            <Plus aria-hidden /> {t("newBooking")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const).map((s) => (
          <span key={s} className={cn("rounded border-l-4 px-2 py-0.5", STATUS_CLASS[s])}>
            {t(`status.${s}`)}
          </span>
        ))}
      </div>

      {data.view === "month" ? (
        <MonthGrid
          data={data}
          bookings={bookings}
          onDay={(date) => navigate({ view: "day", date })}
        />
      ) : (
        <TimeGrid
          data={data}
          days={data.view === "day" ? [data.date] : weekOf(data.date)}
          employees={employees}
          onSelect={setSelected}
          onCreate={(date, employeeId, startMin) =>
            data.canManage && setCreating({ date, employeeId, startMin })
          }
        />
      )}

      <BookingDrawer
        booking={selected}
        data={data}
        onClose={() => setSelected(null)}
        onChanged={() => router.refresh()}
      />
      <NewBookingSheet
        open={creating !== null}
        initial={creating}
        data={data}
        onClose={() => setCreating(null)}
        onCreated={() => {
          setCreating(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function TimeGrid({
  data,
  days,
  employees,
  onSelect,
  onCreate,
}: {
  data: CalendarData;
  days: string[];
  employees: CalendarData["employees"];
  onSelect: (b: CalendarBooking) => void;
  onCreate: (date: string, employeeId: string | null, startMin: number) => void;
}) {
  const t = useTranslations("calendar");
  const format = useFormatter();
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.floor(data.dayStartMin / 60) * 60; m < data.dayEndMin; m += 60) out.push(m);
    return out;
  }, [data.dayStartMin, data.dayEndMin]);
  const columns =
    days.length === 1
      ? employees.map((e) => ({
          key: e.id,
          date: days[0]!,
          employeeId: e.id,
          label: e.name,
          color: e.color,
        }))
      : days.map((d) => ({
          key: d,
          date: d,
          employeeId: null as string | null,
          label: format.dateTime(new Date(`${d}T12:00:00Z`), {
            weekday: "short",
            day: "numeric",
            timeZone: "UTC",
          }),
          color: null,
        }));
  const rowHeight = 48; // px per hour
  const gridHeight = ((data.dayEndMin - data.dayStartMin) / 60) * rowHeight;

  return (
    <div
      className="overflow-x-auto rounded-xl border"
      data-testid={`calendar-${days.length === 1 ? "day" : "week"}`}
    >
      <div className="min-w-[640px]">
        <div
          className="grid"
          style={{ gridTemplateColumns: `4rem repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          <div className="border-b" />
          {columns.map((c) => (
            <div
              key={c.key}
              className={cn(
                "border-b border-l px-2 py-2 text-center text-sm font-medium",
                c.date === data.today && "bg-muted/40",
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {c.color ? (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: c.color }}
                    aria-hidden
                  />
                ) : null}
                {c.label}
              </span>
            </div>
          ))}
        </div>
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `4rem repeat(${columns.length}, minmax(0, 1fr))`,
            height: gridHeight,
          }}
        >
          <div className="relative">
            {hours.map((m) => (
              <div
                key={m}
                className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                style={{ top: `${percent(m, data.dayStartMin, data.dayEndMin)}%` }}
              >
                {minutesLabel(m)}
              </div>
            ))}
          </div>
          {columns.map((c) => {
            const items = data.items.filter(
              (i) =>
                i.date === c.date &&
                (c.employeeId ? i.employeeId === c.employeeId || i.employeeId === null : true),
            );
            const positioned = assignColumns(
              items.filter((i) => i.kind === "booking" && i.status !== "CANCELLED"),
            );
            const cancelled = items.filter(
              (i): i is CalendarBooking => i.kind === "booking" && i.status === "CANCELLED",
            );
            const blocks = items.filter((i) => i.kind !== "booking");
            return (
              <div
                key={c.key}
                className={cn("relative border-l", c.date === data.today && "bg-muted/20")}
                onDoubleClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = (e.clientY - rect.top) / rect.height;
                  const min =
                    data.dayStartMin +
                    Math.floor((ratio * (data.dayEndMin - data.dayStartMin)) / 15) * 15;
                  onCreate(c.date, c.employeeId, min);
                }}
                title={t("doubleClickHint")}
              >
                {hours.map((m) => (
                  <div
                    key={m}
                    className="absolute inset-x-0 border-t border-dashed border-border/60"
                    style={{ top: `${percent(m, data.dayStartMin, data.dayEndMin)}%` }}
                  />
                ))}
                {blocks.map((b) => (
                  <div
                    key={b.id}
                    className="absolute inset-x-0.5 rounded border border-dashed bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--muted)_6px,var(--muted)_12px)] px-1 text-[10px] text-muted-foreground"
                    style={{
                      top: `${percent(b.startMin, data.dayStartMin, data.dayEndMin)}%`,
                      height: `${percent(b.endMin, data.dayStartMin, data.dayEndMin) - percent(b.startMin, data.dayStartMin, data.dayEndMin)}%`,
                    }}
                    title={b.label ?? t(b.kind === "blocked" ? "blocked" : "timeOff")}
                  >
                    {b.label ?? t(b.kind === "blocked" ? "blocked" : "timeOff")}
                  </div>
                ))}
                {[...cancelled.map((b) => ({ ...b, col: 0, cols: 1 })), ...positioned].map(
                  (item) => {
                    const b = item as CalendarBooking & { col: number; cols: number };
                    const top = percent(b.startMin, data.dayStartMin, data.dayEndMin);
                    const height = Math.max(
                      2.5,
                      percent(b.endMin, data.dayStartMin, data.dayEndMin) - top,
                    );
                    const width = 100 / b.cols;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onSelect(b)}
                        className={cn(
                          "absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-xs shadow-sm transition-shadow hover:shadow-md",
                          b.status === "CANCELLED" ? "z-0" : "z-10",
                          STATUS_CLASS[b.status],
                        )}
                        style={{
                          top: `${top}%`,
                          height: `${height}%`,
                          left: `calc(${b.col * width}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                          borderLeftColor: b.color ?? undefined,
                        }}
                        data-testid={`calendar-booking-${b.id}`}
                      >
                        <div className="truncate font-medium">{b.customerName}</div>
                        <div className="truncate opacity-80">
                          {minutesLabel(b.startMin)} · {b.serviceName}
                          {c.employeeId ? "" : ` · ${b.employeeName.split(" ")[0]}`}
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  data,
  bookings,
  onDay,
}: {
  data: CalendarData;
  bookings: CalendarBooking[];
  onDay: (date: string) => void;
}) {
  const t = useTranslations("calendar");
  const tDays = useTranslations("weekdays");
  const month = data.date.slice(0, 7);
  const keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  return (
    <div className="overflow-hidden rounded-xl border" data-testid="calendar-month">
      <div className="grid grid-cols-7 border-b text-center text-xs font-medium">
        {keys.map((k) => (
          <div key={k} className="py-2">
            {tDays(k).slice(0, 3)}
          </div>
        ))}
      </div>
      {monthGrid(data.date).map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day) => {
            const items = bookings.filter((b) => b.date === day && b.status !== "CANCELLED");
            const inMonth = day.startsWith(month);
            return (
              <button
                key={day}
                type="button"
                onClick={() => onDay(day)}
                className={cn(
                  "min-h-24 border-t border-l p-1.5 text-left align-top hover:bg-muted/40",
                  !inMonth && "bg-muted/20 text-muted-foreground",
                  day === data.today && "bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs font-medium", day === data.today && "text-primary")}>
                    {Number(day.slice(8, 10))}
                  </span>
                  {items.length > 0 ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {items.length}
                    </Badge>
                  ) : null}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {items.slice(0, 3).map((b) => (
                    <li
                      key={b.id}
                      className={cn(
                        "truncate rounded border-l-2 px-1 text-[10px]",
                        STATUS_CLASS[b.status],
                      )}
                      style={{ borderLeftColor: b.color ?? undefined }}
                    >
                      {minutesLabel(b.startMin)} {b.customerName}
                    </li>
                  ))}
                  {items.length > 3 ? (
                    <li className="text-[10px] text-muted-foreground">
                      {t("more", { count: items.length - 3 })}
                    </li>
                  ) : null}
                </ul>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
