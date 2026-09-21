"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { errorsFor, useServerAction } from "@/components/forms/use-server-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeNames, type AppLocale } from "@/i18n/routing";
import type { ActionResult } from "@/lib/api/define-action";

export type ProfileValues = {
  firstName: string;
  lastName: string;
  phone: string | null;
  locale: AppLocale;
  email: string;
};

type Props = {
  initial: ProfileValues;
  action: (input: unknown) => Promise<ActionResult<ProfileValues>>;
};

export function ProfileForm({ initial, action }: Props) {
  const t = useTranslations("account.profile");
  const tFields = useTranslations("auth.fields");
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();
  const [values, setValues] = useState({
    firstName: initial.firstName,
    lastName: initial.lastName,
    phone: initial.phone ?? "",
    locale: initial.locale,
  });
  const { run, pending, fieldErrors, formError, success } = useServerAction(action, {
    onSuccess: (data) => {
      if (data.locale !== currentLocale) {
        router.replace(pathname, { locale: data.locale });
      } else {
        router.refresh();
      }
    },
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(values);
  }

  const set = (key: keyof typeof values, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus error={formError} success={success} />
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="firstName">{tFields("firstName")}</FieldLabel>
                <Input
                  id="firstName"
                  value={values.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  aria-invalid={Boolean(fieldErrors["firstName"])}
                  autoComplete="given-name"
                />
                <FieldError errors={errorsFor(fieldErrors, "firstName")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName">{tFields("lastName")}</FieldLabel>
                <Input
                  id="lastName"
                  value={values.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  aria-invalid={Boolean(fieldErrors["lastName"])}
                  autoComplete="family-name"
                />
                <FieldError errors={errorsFor(fieldErrors, "lastName")} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="email">{tFields("email")}</FieldLabel>
              <Input id="email" value={initial.email} readOnly disabled />
              <FieldDescription>{t("emailHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">{tFields("phone")}</FieldLabel>
              <Input
                id="phone"
                type="tel"
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                aria-invalid={Boolean(fieldErrors["phone"])}
                autoComplete="tel"
                placeholder="+387 61 000 000"
              />
              <FieldDescription>{t("phoneHint")}</FieldDescription>
              <FieldError errors={errorsFor(fieldErrors, "phone")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="locale">{t("locale")}</FieldLabel>
              <select
                id="locale"
                value={values.locale}
                onChange={(e) => set("locale", e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm sm:max-w-xs"
              >
                {(Object.keys(localeNames) as AppLocale[]).map((code) => (
                  <option key={code} value={code}>
                    {localeNames[code]}
                  </option>
                ))}
              </select>
              <FieldDescription>{t("localeHint")}</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Button type="submit" disabled={pending} data-testid="profile-save">
        {t("save")}
      </Button>
    </form>
  );
}
