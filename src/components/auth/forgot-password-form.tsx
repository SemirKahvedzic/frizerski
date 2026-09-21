"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { errorList, useFormErrors } from "@/components/auth/use-form-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/modules/auth/client";
import { forgotPasswordSchema } from "@/modules/auth/schemas";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { fieldErrors, formError, validate, setAuthError, clear } =
    useFormErrors(forgotPasswordSchema);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    const form = new FormData(event.currentTarget);
    const values = validate({ email: form.get("email") });
    if (!values) return;

    setPending(true);
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: `/${locale}/reset-password`,
    });
    setPending(false);

    if (error) {
      setAuthError(error.code);
      return;
    }
    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>{t("forgot.sent", { email: sentTo })}</AlertDescription>
        </Alert>
        <Button variant="outline" className="w-full" render={<Link href="/login" />}>
          {t("forgot.back")}
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
          <FieldLabel htmlFor="email">{t("fields.email")}</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(fieldErrors["email"])}
          />
          <FieldError errors={errorList(fieldErrors["email"])} />
        </Field>
      </FieldGroup>
      <Button type="submit" className="w-full" disabled={pending}>
        {t("forgot.submit")}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:underline">
          {t("forgot.back")}
        </Link>
      </p>
    </form>
  );
}
