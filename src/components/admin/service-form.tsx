"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { ImageField } from "@/components/media/image-field";
import { errorsFor, useServerAction } from "@/components/forms/use-server-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";
import type { ImageView } from "@/modules/media/image-view";
import { centsToDecimalString } from "@/lib/money";
import { DURATION_PRESETS } from "@/modules/services/schemas";

export type ServiceFormValues = {
  name: string;
  description: string | null;
  categoryId: string | null;
  priceCents: number;
  durationMinutes: number;
  bufferAfterMinutes: number;
  audience: "MALE" | "FEMALE" | "UNISEX";
  isActive: boolean;
  employeeIds: string[];
};

const EMPTY: ServiceFormValues = {
  name: "",
  description: null,
  categoryId: null,
  priceCents: 0,
  durationMinutes: 30,
  bufferAfterMinutes: 0,
  audience: "UNISEX",
  isActive: true,
  employeeIds: [],
};

type Props = {
  salonSlug: string;
  salonId: string;
  image?: ImageView | null;
  serviceId?: string;
  currency: string;
  initial?: ServiceFormValues;
  categories: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  action: (input: unknown) => Promise<ActionResult<{ id: string }>>;
};

const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function ServiceForm({
  salonSlug,
  salonId,
  image = null,
  serviceId,
  currency,
  initial = EMPTY,
  categories,
  employees,
  action,
}: Props) {
  const t = useTranslations("services");
  const tSalons = useTranslations("salons");
  const router = useRouter();
  const [isActive, setIsActive] = useState(initial.isActive);
  const [employeeIds, setEmployeeIds] = useState<string[]>(initial.employeeIds);
  const [customDuration, setCustomDuration] = useState(
    !DURATION_PRESETS.includes(initial.durationMinutes as (typeof DURATION_PRESETS)[number]),
  );
  const [duration, setDuration] = useState(initial.durationMinutes);
  const { run, pending, fieldErrors, formError, success } = useServerAction(action, {
    onSuccess: () => {
      router.push(`/admin/${salonSlug}/services`);
      router.refresh();
    },
  });

  function toggleEmployee(id: string, checked: boolean) {
    setEmployeeIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => (form.get(key) as string | null) ?? "";
    await run({
      salonSlug,
      ...(serviceId ? { serviceId } : {}),
      name: value("name"),
      description: value("description"),
      categoryId: value("categoryId"),
      priceCents: value("price"),
      durationMinutes: duration,
      bufferAfterMinutes: value("bufferAfterMinutes") || 0,
      audience: value("audience"),
      isActive,
      employeeIds,
      imageId: value("imageId") || null,
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus error={formError} success={success} />
      <Card>
        <CardContent className="pt-6">
          <ImageField
            salonId={salonId}
            purpose="SERVICE"
            name="imageId"
            label={t("form.image")}
            hint={t("form.imageHint")}
            initial={image}
            shape="square"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("form.details")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
              <Field>
                <FieldLabel htmlFor="name">{t("fields.name")}</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  defaultValue={initial.name}
                  required
                  aria-invalid={Boolean(fieldErrors["name"])}
                />
                <FieldError errors={errorsFor(fieldErrors, "name")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="categoryId">{t("fields.category")}</FieldLabel>
                <select
                  id="categoryId"
                  name="categoryId"
                  defaultValue={initial.categoryId ?? ""}
                  className={selectClass}
                >
                  <option value="">{t("fields.noCategory")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="description">{t("fields.description")}</FieldLabel>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={initial.description ?? ""}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="price">{t("fields.price", { currency })}</FieldLabel>
                <Input
                  id="price"
                  name="price"
                  inputMode="decimal"
                  placeholder="20.00"
                  defaultValue={initial.priceCents ? centsToDecimalString(initial.priceCents) : ""}
                  required
                  aria-invalid={Boolean(fieldErrors["priceCents"])}
                />
                <FieldError errors={errorsFor(fieldErrors, "priceCents")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="duration">{t("fields.duration")}</FieldLabel>
                <select
                  id="duration"
                  value={customDuration ? "custom" : String(duration)}
                  onChange={(e) => {
                    if (e.target.value === "custom") {
                      setCustomDuration(true);
                    } else {
                      setCustomDuration(false);
                      setDuration(Number(e.target.value));
                    }
                  }}
                  className={selectClass}
                >
                  {DURATION_PRESETS.map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                  <option value="custom">{t("fields.customDuration")}</option>
                </select>
                {customDuration ? (
                  <Input
                    type="number"
                    min={5}
                    max={600}
                    step={5}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    aria-label={t("fields.duration")}
                    className="mt-2"
                  />
                ) : null}
                <FieldError errors={errorsFor(fieldErrors, "durationMinutes")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bufferAfterMinutes">{t("fields.buffer")}</FieldLabel>
                <Input
                  id="bufferAfterMinutes"
                  name="bufferAfterMinutes"
                  type="number"
                  min={0}
                  max={120}
                  step={5}
                  defaultValue={initial.bufferAfterMinutes}
                />
                <FieldDescription>{t("fields.bufferHint")}</FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="audience">{t("fields.audience")}</FieldLabel>
              <select
                id="audience"
                name="audience"
                defaultValue={initial.audience}
                className={`${selectClass} max-w-60`}
              >
                {(["UNISEX", "MALE", "FEMALE"] as const).map((a) => (
                  <option key={a} value={a}>
                    {tSalons(`audience.${a}`)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">{t("fields.isActive")}</div>
                <div className="text-xs text-muted-foreground">{t("fields.isActiveHint")}</div>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                aria-label={t("fields.isActive")}
              />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.employees")}</CardTitle>
          <CardDescription>{t("form.employeesHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("form.noEmployees")}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {employees.map((e) => (
                <li key={e.id}>
                  <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border"
                      checked={employeeIds.includes(e.id)}
                      onChange={(ev) => toggleEmployee(e.id, ev.target.checked)}
                    />
                    {e.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <FieldError errors={errorsFor(fieldErrors, "employeeIds")} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/admin/${salonSlug}/services`)}
        >
          {t("form.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {serviceId ? t("form.save") : t("form.create")}
        </Button>
      </div>
    </form>
  );
}
