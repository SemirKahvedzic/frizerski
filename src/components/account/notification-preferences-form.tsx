"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { useServerAction } from "@/components/forms/use-server-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";

export type PreferenceValues = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  reminder24h: boolean;
  reminder1h: boolean;
  marketingEmails: boolean;
};

type Key = keyof PreferenceValues;

type Props = {
  initial: PreferenceValues;
  action: (input: unknown) => Promise<ActionResult<PreferenceValues>>;
};

export function NotificationPreferencesForm({ initial, action }: Props) {
  const t = useTranslations("account.notifications");
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const { run, pending, formError, success } = useServerAction(action, {
    onSuccess: (data) => {
      setValues(data);
      router.refresh();
    },
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(values);
  }

  const toggle = (key: Key, disabled = false) => (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <div className="text-sm font-medium">{t(`fields.${key}`)}</div>
        <div className="text-xs text-muted-foreground">{t(`hints.${key}`)}</div>
      </div>
      <Switch
        checked={values[key]}
        disabled={disabled}
        onCheckedChange={(checked) => setValues((v) => ({ ...v, [key]: checked }))}
        aria-label={t(`fields.${key}`)}
        data-testid={`pref-${key}`}
      />
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus error={formError} success={success} />
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.channels")}</CardTitle>
          <CardDescription>{t("sections.channelsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {toggle("emailEnabled")}
          {toggle("pushEnabled")}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.reminders")}</CardTitle>
          <CardDescription>{t("sections.remindersHint")}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {toggle("reminder24h")}
          {toggle("reminder1h")}
          {toggle("marketingEmails")}
        </CardContent>
      </Card>
      <Button type="submit" disabled={pending} data-testid="preferences-save">
        {t("save")}
      </Button>
    </form>
  );
}
