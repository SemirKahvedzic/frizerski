"use client";

import { Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { errorsFor, useServerAction } from "@/components/forms/use-server-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";

export type BlockedTimeValue = {
  id: string;
  employeeId: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

type Props = {
  salonSlug: string;
  timezone: string;
  employees: { id: string; name: string }[];
  items: BlockedTimeValue[];
  addAction: (input: unknown) => Promise<ActionResult<{ id: string }>>;
  removeAction: (input: {
    salonSlug: string;
    blockedTimeId: string;
  }) => Promise<ActionResult<{ id: string }>>;
};

const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function BlockedTimesPanel({
  salonSlug,
  timezone,
  employees,
  items,
  addAction,
  removeAction,
}: Props) {
  const t = useTranslations("availability.blocked");
  const format = useFormatter();
  const router = useRouter();
  const add = useServerAction(addAction, { onSuccess: () => router.refresh() });
  const remove = useServerAction(removeAction, { onSuccess: () => router.refresh() });

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await add.run({
      salonSlug,
      employeeId: data.get("employeeId") ?? "",
      date: data.get("date"),
      startTime: data.get("startTime"),
      endTime: data.get("endTime"),
      reason: data.get("reason") ?? "",
    });
    if (result.ok) form.reset();
  }

  const employeeName = (id: string | null) =>
    id ? (employees.find((e) => e.id === id)?.name ?? "—") : t("wholeSalon");

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
                data-testid="blocked-row"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.employeeId ? "secondary" : "outline"}>
                    {employeeName(item.employeeId)}
                  </Badge>
                  <span>
                    {format.dateTime(new Date(item.startsAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: timezone,
                    })}{" "}
                    –{" "}
                    {format.dateTime(new Date(item.endsAt), {
                      timeStyle: "short",
                      timeZone: timezone,
                    })}
                  </span>
                  {item.reason ? (
                    <span className="text-muted-foreground">· {item.reason}</span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("remove")}
                  onClick={() => remove.run({ salonSlug, blockedTimeId: item.id })}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onAdd} noValidate className="space-y-4 rounded-lg border p-4">
          <FormStatus error={add.formError ?? remove.formError} success={false} />
          <div className="grid gap-4 sm:grid-cols-5">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="employeeId">{t("employee")}</FieldLabel>
              <select id="employeeId" name="employeeId" defaultValue="" className={selectClass}>
                <option value="">{t("wholeSalon")}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="date">{t("date")}</FieldLabel>
              <Input
                id="date"
                name="date"
                type="date"
                required
                aria-invalid={Boolean(add.fieldErrors["date"])}
              />
              <FieldError errors={errorsFor(add.fieldErrors, "date")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="startTime">{t("from")}</FieldLabel>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                step={300}
                defaultValue="13:00"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="endTime">{t("to")}</FieldLabel>
              <Input
                id="endTime"
                name="endTime"
                type="time"
                step={300}
                defaultValue="15:00"
                required
                aria-invalid={Boolean(add.fieldErrors["endTime"])}
              />
              <FieldError errors={errorsFor(add.fieldErrors, "endTime")} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="reason">{t("reason")}</FieldLabel>
            <Input id="reason" name="reason" />
          </Field>
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
