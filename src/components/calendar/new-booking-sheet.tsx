"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import type { CalendarData } from "@/components/calendar/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type Initial = { date: string; employeeId: string | null; startMin: number | null } | null;

const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function NewBookingSheet({
  open,
  initial,
  data,
  onClose,
  onCreated,
}: {
  open: boolean;
  initial: Initial;
  data: CalendarData;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("calendar.create");
  const tAuth = useTranslations("auth.fields");
  const format = useFormatter();
  const [serviceId, setServiceId] = useState(data.services[0]?.id ?? "");
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? "");
  const [date, setDate] = useState(initial?.date ?? data.date);
  const [slots, setSlots] = useState<{ startsAt: string; employeeIds: string[] }[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      setDate(initial?.date ?? data.date);
      setEmployeeId(initial?.employeeId ?? "");
      setChosen(null);
      setError(null);
    }, 0);
    return () => clearTimeout(id);
  }, [open, initial, data.date]);

  const service = data.services.find((s) => s.id === serviceId);
  const eligible = service
    ? data.employees.filter((e) => service.employeeIds.includes(e.id))
    : data.employees;

  const loadSlots = useCallback(async () => {
    if (!serviceId) return;
    const emp = employeeId || "any";
    const response = await fetch(
      `/api/v1/salons/${data.salonId}/availability?serviceId=${serviceId}&employeeId=${emp}&date=${date}&ignoreNotice=true`,
    );
    const body = await response.json();
    setSlots(response.ok ? body.data.slots : []);
  }, [data.salonId, serviceId, employeeId, date]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => void loadSlots(), 0);
    return () => clearTimeout(id);
  }, [open, loadSlots]);

  useEffect(() => {
    if (!open || !initial?.startMin || slots.length === 0) return;
    const id = setTimeout(() => {
      const match = slots.find((s) => {
        const d = new Date(s.startsAt);
        const parts = format.dateTime(d, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: data.timezone,
        });
        const [h, m] = parts.split(":").map(Number);
        return (h ?? 0) * 60 + (m ?? 0) === initial.startMin;
      });
      if (match) setChosen(match.startsAt);
    }, 0);
    return () => clearTimeout(id);
  }, [open, initial, slots, format, data.timezone]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const value = (k: string) => (form.get(k) as string | null) ?? "";
    const slot = slots.find((s) => s.startsAt === chosen);
    const chosenEmployee = employeeId || slot?.employeeIds[0] || "";
    try {
      const response = await fetch(`/api/v1/salons/${data.salonId}/bookings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId,
          employeeId: chosenEmployee,
          startsAt: chosen,
          source: value("source"),
          status: value("status"),
          internalNotes: value("internalNotes"),
          customer: {
            firstName: value("firstName"),
            lastName: value("lastName"),
            email: value("email"),
            phone: value("phone"),
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message ?? t("error"));
        return;
      }
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="new-booking-sheet"
      >
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("subtitle")}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="space-y-4 px-4 pb-6">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nb-service">{t("service")}</FieldLabel>
              <select
                id="nb-service"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className={selectClass}
              >
                {data.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.durationMinutes} min
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nb-employee">{t("employee")}</FieldLabel>
                <select
                  id="nb-employee"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">{t("anyEmployee")}</option>
                  {eligible.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="nb-date">{t("date")}</FieldLabel>
                <Input
                  id="nb-date"
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>{t("time")}</FieldLabel>
              {slots.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noSlots")}</p>
              ) : (
                <ul className="grid grid-cols-4 gap-1" data-testid="new-booking-slots">
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
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nb-first">{tAuth("firstName")}</FieldLabel>
                <Input id="nb-first" name="firstName" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="nb-last">{tAuth("lastName")}</FieldLabel>
                <Input id="nb-last" name="lastName" required />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nb-email">{tAuth("email")}</FieldLabel>
                <Input id="nb-email" name="email" type="email" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="nb-phone">{t("phone")}</FieldLabel>
                <Input id="nb-phone" name="phone" type="tel" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nb-source">{t("source")}</FieldLabel>
                <select id="nb-source" name="source" defaultValue="ADMIN" className={selectClass}>
                  <option value="ADMIN">{t("sources.ADMIN")}</option>
                  <option value="WALK_IN">{t("sources.WALK_IN")}</option>
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="nb-status">{t("status")}</FieldLabel>
                <select
                  id="nb-status"
                  name="status"
                  defaultValue="CONFIRMED"
                  className={selectClass}
                >
                  <option value="CONFIRMED">{t("statuses.CONFIRMED")}</option>
                  <option value="PENDING">{t("statuses.PENDING")}</option>
                </select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="nb-notes">{t("internalNotes")}</FieldLabel>
              <Textarea id="nb-notes" name="internalNotes" rows={2} />
            </Field>
          </FieldGroup>
          <Button
            type="submit"
            className="w-full"
            disabled={!chosen || busy}
            data-testid="new-booking-submit"
          >
            {t("submit")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
