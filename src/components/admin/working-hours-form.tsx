"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { useServerAction } from "@/components/forms/use-server-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";

export type WorkingDayValue = {
  weekday: number;
  isClosed: boolean;
  opensAt: string;
  closesAt: string;
};

type Props = {
  salonSlug: string;
  initial: WorkingDayValue[];
  action: (input: unknown) => Promise<ActionResult<{ days: WorkingDayValue[] }>>;
};

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function WorkingHoursForm({ salonSlug, initial, action }: Props) {
  const t = useTranslations("salonAdmin.hours");
  const tDays = useTranslations("weekdays");
  const router = useRouter();
  const [days, setDays] = useState<WorkingDayValue[]>(initial);
  const { run, pending, fieldErrors, formError, success } = useServerAction(action, {
    onSuccess: () => router.refresh(),
  });

  function update(weekday: number, patch: Partial<WorkingDayValue>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  }

  function copyMondayToWeekdays() {
    const monday = days.find((d) => d.weekday === 0);
    if (!monday) return;
    setDays((prev) =>
      prev.map((d) =>
        d.weekday >= 1 && d.weekday <= 4 ? { ...d, ...monday, weekday: d.weekday } : d,
      ),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run({ salonSlug, days });
  }

  const dayError = (index: number) =>
    fieldErrors[`days.${index}.closesAt`] ??
    fieldErrors[`days.${index}.opensAt`] ??
    fieldErrors[`days.${index}`];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus error={formError ?? fieldErrors["days"] ?? null} success={success} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("hint")}</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={copyMondayToWeekdays}>
            {t("copyMonday")}
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {days.map((day, index) => (
              <li
                key={day.weekday}
                className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 sm:grid-cols-[8rem_auto_1fr]"
                data-testid={`hours-${WEEKDAY_KEYS[day.weekday]}`}
              >
                <span className="font-medium">{tDays(WEEKDAY_KEYS[day.weekday] ?? "mon")}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border"
                    checked={!day.isClosed}
                    onChange={(e) => update(day.weekday, { isClosed: !e.target.checked })}
                    aria-label={`${tDays(WEEKDAY_KEYS[day.weekday] ?? "mon")} ${t("open")}`}
                  />
                  {day.isClosed ? t("closed") : t("open")}
                </label>
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                  <Input
                    type="time"
                    step={300}
                    value={day.opensAt}
                    disabled={day.isClosed}
                    onChange={(e) => update(day.weekday, { opensAt: e.target.value })}
                    aria-label={`${tDays(WEEKDAY_KEYS[day.weekday] ?? "mon")} ${t("opensAt")}`}
                    className="max-w-32"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    step={300}
                    value={day.closesAt}
                    disabled={day.isClosed}
                    onChange={(e) => update(day.weekday, { closesAt: e.target.value })}
                    aria-label={`${tDays(WEEKDAY_KEYS[day.weekday] ?? "mon")} ${t("closesAt")}`}
                    className="max-w-32"
                  />
                  {dayError(index) ? (
                    <span className="text-xs text-destructive">{dayError(index)}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
