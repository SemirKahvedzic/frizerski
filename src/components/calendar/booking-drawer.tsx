"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import type { CalendarBooking, CalendarData } from "@/components/calendar/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDuration, formatMoney } from "@/lib/money";
import { allowedTransitions } from "@/modules/booking/engine/state-machine";

type Transition = "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

export function BookingDrawer({
  booking,
  data,
  onClose,
  onChanged,
}: {
  booking: CalendarBooking | null;
  data: CalendarData;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("calendar.drawer");
  const tStatus = useTranslations("bookingStatus");
  const tActions = useTranslations("appointments.actions");
  const format = useFormatter();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState(booking?.date ?? data.date);
  const [moveEmployee, setMoveEmployee] = useState(booking?.employeeId ?? "");
  const [slots, setSlots] = useState<{ startsAt: string }[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (!booking) return;
    const id = setTimeout(() => {
      setMessage(null);
      setMoving(false);
      setMoveDate(booking.date);
      setMoveEmployee(booking.employeeId);
      setChosen(null);
    }, 0);
    return () => clearTimeout(id);
  }, [booking]);

  const loadSlots = useCallback(async () => {
    if (!booking) return;
    const response = await fetch(
      `/api/v1/salons/${data.salonId}/availability?serviceId=${booking.serviceId}&employeeId=${moveEmployee}&date=${moveDate}&ignoreNotice=true`,
    );
    const body = await response.json();
    setSlots(response.ok ? body.data.slots : []);
  }, [booking, data.salonId, moveEmployee, moveDate]);

  useEffect(() => {
    if (!moving) return;
    const id = setTimeout(() => void loadSlots(), 0);
    return () => clearTimeout(id);
  }, [moving, loadSlots]);

  if (!booking) return <Sheet open={false} />;

  const actorKind = data.canManage ? "staff" : "employee";
  const transitions = allowedTransitions(booking.status, actorKind).filter(
    (s): s is Transition => s !== "PENDING",
  );

  async function post(url: string, payload: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage({ kind: "error", text: body.error?.message ?? t("error") });
        return;
      }
      setMessage({ kind: "ok", text: okText });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="booking-drawer"
      >
        <SheetHeader>
          <SheetTitle>{booking.customerName}</SheetTitle>
          <SheetDescription>
            {format.dateTime(new Date(booking.startsAt), {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: data.timezone,
            })}{" "}
            –{" "}
            {format.dateTime(new Date(booking.endsAt), {
              timeStyle: "short",
              timeZone: data.timezone,
            })}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{tStatus(booking.status)}</Badge>
            <Badge variant="outline">{t(`source.${booking.source}`)}</Badge>
          </div>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
            <dt className="text-muted-foreground">{t("service")}</dt>
            <dd>
              {booking.serviceName} ·{" "}
              {formatDuration(booking.durationMinutes, { h: "h", min: "min" })} ·{" "}
              {formatMoney(booking.priceCents, booking.currency, locale)}
            </dd>
            <dt className="text-muted-foreground">{t("employee")}</dt>
            <dd className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: booking.color ?? "#475569" }}
                aria-hidden
              />
              {booking.employeeName}
            </dd>
            <dt className="text-muted-foreground">{t("contact")}</dt>
            <dd>
              <div>{booking.customerEmail}</div>
              {booking.customerPhone ? <div>{booking.customerPhone}</div> : null}
            </dd>
            {booking.clientNotes ? (
              <>
                <dt className="text-muted-foreground">{t("clientNotes")}</dt>
                <dd className="italic">“{booking.clientNotes}”</dd>
              </>
            ) : null}
            {booking.internalNotes ? (
              <>
                <dt className="text-muted-foreground">{t("internalNotes")}</dt>
                <dd>{booking.internalNotes}</dd>
              </>
            ) : null}
          </dl>

          {message ? (
            <Alert variant={message.kind === "error" ? "destructive" : undefined}>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          ) : null}

          {transitions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {transitions.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={
                    status === "CANCELLED" || status === "NO_SHOW" ? "destructive" : "outline"
                  }
                  disabled={busy}
                  onClick={() =>
                    post(
                      `/api/v1/salons/${data.salonId}/bookings/${booking.id}/status`,
                      { status, version: booking.version },
                      t("statusChanged"),
                    )
                  }
                  data-testid={`drawer-action-${status}`}
                >
                  {tActions(status)}
                </Button>
              ))}
            </div>
          ) : null}

          {data.canManage && (booking.status === "PENDING" || booking.status === "CONFIRMED") ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{t("move")}</span>
                <Button size="sm" variant="ghost" onClick={() => setMoving((m) => !m)}>
                  {moving ? t("moveClose") : t("moveOpen")}
                </Button>
              </div>
              {moving ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      type="date"
                      value={moveDate}
                      onChange={(e) => e.target.value && setMoveDate(e.target.value)}
                      aria-label={t("moveDate")}
                    />
                    <select
                      value={moveEmployee}
                      onChange={(e) => setMoveEmployee(e.target.value)}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                      aria-label={t("employee")}
                    >
                      {data.employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {slots.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("noSlots")}</p>
                  ) : (
                    <ul className="grid grid-cols-4 gap-1">
                      {slots.map((s) => (
                        <li key={s.startsAt}>
                          <button
                            type="button"
                            onClick={() => setChosen(s.startsAt)}
                            className={`w-full rounded border px-1 py-1 text-xs tabular-nums ${chosen === s.startsAt ? "bg-primary text-primary-foreground" : "hover:border-primary"}`}
                          >
                            {format.dateTime(new Date(s.startsAt), {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: data.timezone,
                            })}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    size="sm"
                    disabled={!chosen || busy}
                    onClick={() =>
                      chosen &&
                      post(
                        `/api/v1/salons/${data.salonId}/bookings/${booking.id}/reschedule`,
                        { startsAt: chosen, employeeId: moveEmployee, version: booking.version },
                        t("moved"),
                      )
                    }
                  >
                    {t("moveConfirm")}
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
