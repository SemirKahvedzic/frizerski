"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { errorList, useFormErrors } from "@/components/auth/use-form-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/modules/auth/client";
import { resetPasswordSchema } from "@/modules/auth/schemas";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const invalidLink = searchParams.get("error") === "INVALID_TOKEN";
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const { fieldErrors, formError, validate, setAuthError, clear } =
    useFormErrors(resetPasswordSchema);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const values = validate({
      password: form.get("password"),
      confirmPassword: form.get("confirmPassword"),
    });
    if (!values) return;

    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: values.password, token });
    setPending(false);

    if (error) {
      setAuthError(error.code);
      return;
    }
    setDone(true);
  }

  if (!token || invalidLink) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>
            {invalidLink ? t("errors.INVALID_TOKEN") : t("reset.missingToken")}
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="w-full" render={<Link href="/forgot-password" />}>
          {t("forgot.title")}
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>{t("reset.success")}</AlertDescription>
        </Alert>
        <Button className="w-full" render={<Link href="/login" />}>
          {t("reset.toLogin")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="password">{t("fields.newPassword")}</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(fieldErrors["password"])}
          />
          <FieldError errors={errorList(fieldErrors["password"])} />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirmPassword">{t("fields.confirmPassword")}</FieldLabel>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(fieldErrors["confirmPassword"])}
          />
          <FieldError errors={errorList(fieldErrors["confirmPassword"])} />
        </Field>
      </FieldGroup>
      <Button type="submit" className="w-full" disabled={pending}>
        {t("reset.submit")}
      </Button>
    </form>
  );
}
