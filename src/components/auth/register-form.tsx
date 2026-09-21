"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { errorList, useFormErrors } from "@/components/auth/use-form-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/modules/auth/client";
import { registerSchema } from "@/modules/auth/schemas";

export function RegisterForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const { fieldErrors, formError, validate, setAuthError, clear } = useFormErrors(registerSchema);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    const form = new FormData(event.currentTarget);
    const values = validate({
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      email: form.get("email"),
      phone: form.get("phone") ?? "",
      password: form.get("password"),
      confirmPassword: form.get("confirmPassword"),
    });
    if (!values) return;

    setPending(true);
    const { error } = await authClient.signUp.email({
      name: `${values.firstName} ${values.lastName}`,
      email: values.email,
      password: values.password,
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone || undefined,
      locale,
      callbackURL: `/${locale}/account`,
    });
    setPending(false);

    if (error) {
      setAuthError(error.code);
      return;
    }
    router.push({ pathname: "/verify-email", query: { email: values.email } });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="firstName">{t("fields.firstName")}</FieldLabel>
            <Input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              required
              aria-invalid={Boolean(fieldErrors["firstName"])}
            />
            <FieldError errors={errorList(fieldErrors["firstName"])} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lastName">{t("fields.lastName")}</FieldLabel>
            <Input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              required
              aria-invalid={Boolean(fieldErrors["lastName"])}
            />
            <FieldError errors={errorList(fieldErrors["lastName"])} />
          </Field>
        </div>
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
        <Field>
          <FieldLabel htmlFor="phone">{t("fields.phone")}</FieldLabel>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+387 61 123 456"
            aria-invalid={Boolean(fieldErrors["phone"])}
          />
          <FieldError errors={errorList(fieldErrors["phone"])} />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">{t("fields.password")}</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(fieldErrors["password"])}
          />
          <FieldDescription>{t("validation.passwordMin")}</FieldDescription>
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
        {t("register.submit")}
      </Button>

      <p className="text-center text-xs text-muted-foreground">{t("register.terms")}</p>

      <p className="text-center text-sm text-muted-foreground">
        {t("register.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          {t("register.login")}
        </Link>
      </p>
    </form>
  );
}
