"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { errorList, useFormErrors } from "@/components/auth/use-form-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/modules/auth/client";
import { loginSchema, safeNextPath } from "@/modules/auth/schemas";

export function LoginForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const { fieldErrors, formError, validate, setAuthError, clear } = useFormErrors(loginSchema);

  const nextPath = safeNextPath(searchParams.get("next"), `/${locale}/account`);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    const form = new FormData(event.currentTarget);
    const values = validate({ email: form.get("email"), password: form.get("password") });
    if (!values) return;

    setPending(true);
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    setPending(false);

    if (error) {
      setAuthError(error.code);
      return;
    }
    router.push(nextPath.replace(new RegExp(`^/${locale}`), "") || "/account");
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
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">{t("fields.password")}</FieldLabel>
            <Link href="/forgot-password" className="text-sm text-muted-foreground hover:underline">
              {t("login.forgot")}
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(fieldErrors["password"])}
          />
          <FieldError errors={errorList(fieldErrors["password"])} />
        </Field>
      </FieldGroup>

      <Button type="submit" className="w-full" disabled={pending}>
        {t("login.submit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("login.noAccount")}{" "}
        <Link href="/register" className="font-medium text-foreground hover:underline">
          {t("login.register")}
        </Link>
      </p>
    </form>
  );
}
