"use client";

import { Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { errorsFor, useServerAction } from "@/components/forms/use-server-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";

export type TimeOffValue = {
  id: string;
  type: "VACATION" | "SICK" | "PERSONAL" | "OTHER";
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  reason: string | null;
};

type Props = {
  salonSlug: string;
  employeeId: string;
  timezone: string;
  items: TimeOffValue[];
  addAction: (input: unknown) => Promise<ActionResult<{ id: string }>>;
  removeAction: (input: {
    salonSlug: string;
    timeOffId: string;
  }) => Promise<ActionResult<{ id: string }>>;
};

const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function TimeOffPanel({
  salonSlug,
  employeeId,
  timezone,
  items,
  addAction,
  removeAction,
}: Props) {
  const t = useTranslations("employees.timeOff");
  const format = useFormatter();
  const router = useRouter();
  const [allDay, setAllDay] = useState(true);
  const add = useServerAction(addAction, { onSuccess: () => router.refresh() });
  const remove = useServerAction(removeAction, { onSuccess: () => router.refresh() });

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await add.run({
      salonSlug,
      employeeId,
      type: data.get("type"),
      startsOn: data.get("startsOn"),
      endsOn: data.get("endsOn"),
      allDay,
      startTime: allDay ? undefined : data.get("startTime"),
      endTime: allDay ? undefined : data.get("endTime"),
      reason: data.get("reason") ?? "",
    });
    if (result.ok) form.reset();
  }

  const label = (item: TimeOffValue) => {
    const start = new Date(item.startsAt);
    const end = new Date(item.endsAt);
    if (item.allDay) {
      const lastDay = new Date(end.getTime() - 1);
      const a = format.dateTime(start, { dateStyle: "medium", timeZone: timezone });
      const b = format.dateTime(lastDay, { dateStyle: "medium", timeZone: timezone });
      return a === b ? a : `${a} – ${b}`;
    }
    return `${format.dateTime(start, { dateStyle: "medium", timeStyle: "short", timeZone: timezone })} – ${format.dateTime(end, { timeStyle: "short", timeZone: timezone })}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                data-testid="time-off-row"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t(`types.${item.type}`)}</Badge>
                  <span>{label(item)}</span>
                  {item.reason ? (
                    <span className="text-muted-foreground">· {item.reason}</span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("remove")}
                  onClick={() => remove.run({ salonSlug, timeOffId: item.id })}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onAdd} noValidate className="space-y-4 rounded-lg border p-4">
          <FormStatus error={add.formError ?? remove.formError} success={false} />
          <div className="grid gap-4 sm:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="type">{t("type")}</FieldLabel>
              <select id="type" name="type" defaultValue="VACATION" className={selectClass}>
                {(["VACATION", "SICK", "PERSONAL", "OTHER"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`types.${v}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="startsOn">{t("startsOn")}</FieldLabel>
              <Input
                id="startsOn"
                name="startsOn"
                type="date"
                required
                aria-invalid={Boolean(add.fieldErrors["startsOn"])}
              />
              <FieldError errors={errorsFor(add.fieldErrors, "startsOn")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="endsOn">{t("endsOn")}</FieldLabel>
              <Input
                id="endsOn"
                name="endsOn"
                type="date"
                required
                aria-invalid={Boolean(add.fieldErrors["endsOn"])}
              />
              <FieldError errors={errorsFor(add.fieldErrors, "endsOn")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="reason">{t("reason")}</FieldLabel>
              <Input id="reason" name="reason" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            {t("allDay")}
          </label>
          {!allDay ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="startTime">{t("startTime")}</FieldLabel>
                <Input
                  id="startTime"
                  name="startTime"
                  type="time"
                  step={300}
                  defaultValue="13:00"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="endTime">{t("endTime")}</FieldLabel>
                <Input id="endTime" name="endTime" type="time" step={300} defaultValue="15:00" />
                <FieldError errors={errorsFor(add.fieldErrors, "endTime")} />
              </Field>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" variant="outline" disabled={add.pending}>
              {t("add")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
