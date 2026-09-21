"use client";

import { Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { errorsFor, useServerAction } from "@/components/forms/use-server-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";

export type ClosureValue = { id: string; startsOn: string; endsOn: string; reason: string | null };

type Props = {
  salonSlug: string;
  closures: ClosureValue[];
  addAction: (input: unknown) => Promise<ActionResult<ClosureValue>>;
  removeAction: (input: {
    salonSlug: string;
    closureId: string;
  }) => Promise<ActionResult<{ id: string }>>;
};

export function ClosuresPanel({ salonSlug, closures, addAction, removeAction }: Props) {
  const t = useTranslations("salonAdmin.closures");
  const format = useFormatter();
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const add = useServerAction(addAction, { onSuccess: () => router.refresh() });
  const remove = useServerAction(removeAction, { onSuccess: () => router.refresh() });

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await add.run({
      salonSlug,
      startsOn: data.get("startsOn"),
      endsOn: data.get("endsOn"),
      reason: data.get("reason") ?? "",
    });
    if (result.ok) form.reset();
  }

  async function onRemove(closureId: string) {
    setRemoving(closureId);
    await remove.run({ salonSlug, closureId });
    setRemoving(null);
  }

  const dateLabel = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {closures.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {closures.map((closure) => (
              <li
                key={closure.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                data-testid="closure-row"
              >
                <div>
                  <div className="font-medium">
                    {closure.startsOn === closure.endsOn
                      ? dateLabel(closure.startsOn)
                      : `${dateLabel(closure.startsOn)} – ${dateLabel(closure.endsOn)}`}
                  </div>
                  {closure.reason ? (
                    <div className="text-muted-foreground">{closure.reason}</div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("remove")}
                  disabled={removing === closure.id}
                  onClick={() => onRemove(closure.id)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onAdd} noValidate className="space-y-4 rounded-lg border p-4">
          <FormStatus error={add.formError ?? remove.formError} success={false} />
          <div className="grid gap-4 sm:grid-cols-3">
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
              <Input id="reason" name="reason" placeholder={t("reasonPlaceholder")} />
              <FieldError errors={errorsFor(add.fieldErrors, "reason")} />
            </Field>
          </div>
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
