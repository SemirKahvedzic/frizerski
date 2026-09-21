"use client";

import { useTranslations } from "next-intl";
import type { FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { errorsFor, useServerAction } from "@/components/forms/use-server-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";
import { useState } from "react";

export type EmployeeFormValues = {
  firstName: string;
  lastName: string;
  position: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  audience: "MALE" | "FEMALE" | "UNISEX";
  color: string | null;
  isActive: boolean;
  isBookableOnline: boolean;
};

const EMPTY: EmployeeFormValues = {
  firstName: "",
  lastName: "",
  position: null,
  bio: null,
  email: null,
  phone: null,
  audience: "UNISEX",
  color: null,
  isActive: true,
  isBookableOnline: true,
};

const COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#65a30d",
  "#0891b2",
  "#475569",
];
const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

type Props = {
  salonSlug: string;
  employeeId?: string;
  initial?: EmployeeFormValues;
  action: (input: unknown) => Promise<ActionResult<{ id: string }>>;
  onSaved?: "back" | "stay";
};

export function EmployeeForm({
  salonSlug,
  employeeId,
  initial = EMPTY,
  action,
  onSaved = "stay",
}: Props) {
  const t = useTranslations("employees");
  const tSalons = useTranslations("salons");
  const router = useRouter();
  const [isActive, setIsActive] = useState(initial.isActive);
  const [bookable, setBookable] = useState(initial.isBookableOnline);
  const [color, setColor] = useState(initial.color ?? COLORS[0]!);
  const { run, pending, fieldErrors, formError, success } = useServerAction(action, {
    onSuccess: (data) => {
      if (onSaved === "back" || !employeeId)
        router.push(`/admin/${salonSlug}/employees/${data.id}`);
      router.refresh();
    },
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => (form.get(key) as string | null) ?? "";
    await run({
      salonSlug,
      ...(employeeId ? { employeeId } : {}),
      firstName: value("firstName"),
      lastName: value("lastName"),
      position: value("position"),
      bio: value("bio"),
      email: value("email"),
      phone: value("phone"),
      audience: value("audience"),
      color,
      isActive,
      isBookableOnline: bookable,
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus error={formError} success={success} />
      <Card>
        <CardHeader>
          <CardTitle>{t("form.profile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="firstName">{t("fields.firstName")}</FieldLabel>
                <Input
                  id="firstName"
                  name="firstName"
                  defaultValue={initial.firstName}
                  required
                  aria-invalid={Boolean(fieldErrors["firstName"])}
                />
                <FieldError errors={errorsFor(fieldErrors, "firstName")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName">{t("fields.lastName")}</FieldLabel>
                <Input
                  id="lastName"
                  name="lastName"
                  defaultValue={initial.lastName}
                  required
                  aria-invalid={Boolean(fieldErrors["lastName"])}
                />
                <FieldError errors={errorsFor(fieldErrors, "lastName")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="position">{t("fields.position")}</FieldLabel>
                <Input
                  id="position"
                  name="position"
                  defaultValue={initial.position ?? ""}
                  placeholder={t("fields.positionPlaceholder")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="audience">{t("fields.audience")}</FieldLabel>
                <select
                  id="audience"
                  name="audience"
                  defaultValue={initial.audience}
                  className={selectClass}
                >
                  {(["MALE", "FEMALE", "UNISEX"] as const).map((a) => (
                    <option key={a} value={a}>
                      {tSalons(`audience.${a}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="bio">{t("fields.bio")}</FieldLabel>
              <Textarea id="bio" name="bio" rows={3} defaultValue={initial.bio ?? ""} />
              <FieldDescription>{t("fields.bioHint")}</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="email">{t("fields.email")}</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={initial.email ?? ""}
                  aria-invalid={Boolean(fieldErrors["email"])}
                />
                <FieldError errors={errorsFor(fieldErrors, "email")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">{t("fields.phone")}</FieldLabel>
                <Input id="phone" name="phone" type="tel" defaultValue={initial.phone ?? ""} />
              </Field>
            </div>
            <Field>
              <FieldLabel>{t("fields.color")}</FieldLabel>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label={t("fields.color")}
              >
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className="size-7 rounded-full border-2 transition-transform"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? "var(--foreground)" : "transparent",
                      transform: color === c ? "scale(1.1)" : undefined,
                    }}
                  />
                ))}
              </div>
              <FieldDescription>{t("fields.colorHint")}</FieldDescription>
            </Field>
            <div className="divide-y">
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
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium">{t("fields.isBookableOnline")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("fields.isBookableOnlineHint")}
                  </div>
                </div>
                <Switch
                  checked={bookable}
                  onCheckedChange={setBookable}
                  aria-label={t("fields.isBookableOnline")}
                />
              </div>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {employeeId ? t("form.save") : t("form.create")}
        </Button>
      </div>
    </form>
  );
}
