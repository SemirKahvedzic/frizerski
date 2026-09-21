"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { errorsFor, useServerAction } from "@/components/forms/use-server-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";
import { SUPPORTED_CURRENCIES } from "@/modules/salons/schemas";

export type SettingsValues = {
  slotIntervalMinutes: number;
  minBookingNoticeMinutes: number;
  maxBookingAdvanceDays: number;
  cancellationCutoffHours: number;
  rescheduleCutoffHours: number;
  bufferMinutes: number;
  autoConfirmBookings: boolean;
  allowAnyEmployee: boolean;
  allowGuestBooking: boolean;
  requirePhone: boolean;
  emailNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  notifyAdminsOnNewBooking: boolean;
  notifyEmployeeOnNewBooking: boolean;
  reminder24hEnabled: boolean;
  reminder1hEnabled: boolean;
  timezone: string;
  currency: string;
};

type BoolKey = {
  [K in keyof SettingsValues]: SettingsValues[K] extends boolean ? K : never;
}[keyof SettingsValues];
type NumKey = {
  [K in keyof SettingsValues]: SettingsValues[K] extends number ? K : never;
}[keyof SettingsValues];

type Props = {
  salonSlug: string;
  initial: SettingsValues;
  action: (input: unknown) => Promise<ActionResult<SettingsValues>>;
};

const TIMEZONES = [
  "Europe/Sarajevo",
  "Europe/Zagreb",
  "Europe/Belgrade",
  "Europe/Ljubljana",
  "Europe/Vienna",
  "Europe/Berlin",
  "Europe/Zurich",
  "Europe/Rome",
  "Europe/London",
];
const SLOT_INTERVALS = [5, 10, 15, 20, 30, 45, 60];
const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function SalonSettingsForm({ salonSlug, initial, action }: Props) {
  const t = useTranslations("salonAdmin.settings");
  const tSalons = useTranslations("salons");
  const router = useRouter();
  const [values, setValues] = useState<SettingsValues>(initial);
  const { run, pending, fieldErrors, formError, success } = useServerAction(action, {
    onSuccess: (data) => {
      setValues(data);
      router.refresh();
    },
  });

  const setBool = (key: BoolKey, checked: boolean) => setValues((v) => ({ ...v, [key]: checked }));
  const setNum = (key: NumKey, raw: string) =>
    setValues((v) => ({ ...v, [key]: raw === "" ? 0 : Number(raw) }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run({ salonSlug, ...values });
  }

  const toggle = (key: BoolKey) => (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <div className="text-sm font-medium">{t(`fields.${key}`)}</div>
        <div className="text-xs text-muted-foreground">{t(`hints.${key}`)}</div>
      </div>
      <Switch
        checked={values[key]}
        onCheckedChange={(checked) => setBool(key, checked)}
        aria-label={t(`fields.${key}`)}
      />
    </div>
  );

  const number = (
    key: NumKey,
    unit: string,
    extra: { min?: number; max?: number; step?: number } = {},
  ) => (
    <Field>
      <FieldLabel htmlFor={key}>{t(`fields.${key}`)}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={key}
          type="number"
          inputMode="numeric"
          value={values[key]}
          onChange={(e) => setNum(key, e.target.value)}
          className="max-w-32"
          aria-invalid={Boolean(fieldErrors[key])}
          {...extra}
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <FieldDescription>{t(`hints.${key}`)}</FieldDescription>
      <FieldError errors={errorsFor(fieldErrors, key)} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus error={formError} success={success} />

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.booking")}</CardTitle>
          <CardDescription>{t("sections.bookingHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="slotIntervalMinutes">
                {t("fields.slotIntervalMinutes")}
              </FieldLabel>
              <select
                id="slotIntervalMinutes"
                value={values.slotIntervalMinutes}
                onChange={(e) => setNum("slotIntervalMinutes", e.target.value)}
                className={`${selectClass} max-w-40`}
              >
                {SLOT_INTERVALS.map((n) => (
                  <option key={n} value={n}>
                    {n} min
                  </option>
                ))}
              </select>
              <FieldDescription>{t("hints.slotIntervalMinutes")}</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {number("minBookingNoticeMinutes", "min", { min: 0, step: 15 })}
              {number("maxBookingAdvanceDays", t("units.days"), { min: 1, max: 365 })}
              {number("bufferMinutes", "min", { min: 0, max: 120, step: 5 })}
            </div>
            {toggle("autoConfirmBookings")}
            {toggle("allowAnyEmployee")}
            {toggle("allowGuestBooking")}
            {toggle("requirePhone")}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.policy")}</CardTitle>
          <CardDescription>{t("sections.policyHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {number("cancellationCutoffHours", t("units.hours"), { min: 0, max: 720 })}
            {number("rescheduleCutoffHours", t("units.hours"), { min: 0, max: 720 })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.notifications")}</CardTitle>
          <CardDescription>{t("sections.notificationsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {toggle("emailNotificationsEnabled")}
          {toggle("pushNotificationsEnabled")}
          {toggle("notifyAdminsOnNewBooking")}
          {toggle("notifyEmployeeOnNewBooking")}
          {toggle("reminder24hEnabled")}
          {toggle("reminder1hEnabled")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.localization")}</CardTitle>
          <CardDescription>{t("sections.localizationHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="timezone">{tSalons("fields.timezone")}</FieldLabel>
              <select
                id="timezone"
                value={values.timezone}
                onChange={(e) => setValues((v) => ({ ...v, timezone: e.target.value }))}
                className={selectClass}
              >
                {[...new Set([values.timezone, ...TIMEZONES])].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <FieldDescription>{t("hints.timezone")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="currency">{tSalons("fields.currency")}</FieldLabel>
              <select
                id="currency"
                value={values.currency}
                onChange={(e) => setValues((v) => ({ ...v, currency: e.target.value }))}
                className={selectClass}
              >
                {[...new Set([values.currency, ...SUPPORTED_CURRENCIES])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
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
