"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { errorsFor, useServerAction } from "@/components/forms/use-server-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";

type Props = {
  salonSlug: string;
  employeeId: string;
  linkedEmail: string | null;
  defaultEmail: string | null;
  action: (input: unknown) => Promise<ActionResult<{ linked: boolean }>>;
};

export function InvitePanel({ salonSlug, employeeId, linkedEmail, defaultEmail, action }: Props) {
  const t = useTranslations("employees.access");
  const locale = useLocale();
  const router = useRouter();
  const [result, setResult] = useState<"linked" | "invited" | null>(null);
  const { run, pending, fieldErrors, formError } = useServerAction(action, {
    onSuccess: (data) => {
      setResult(data.linked ? "linked" : "invited");
      router.refresh();
    },
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run({ salonSlug, employeeId, locale, email: data.get("email") });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {linkedEmail ? (
          <Alert>
            <AlertDescription>{t("linkedTo", { email: linkedEmail })}</AlertDescription>
          </Alert>
        ) : null}
        {result ? (
          <Alert>
            <AlertDescription>
              {result === "linked" ? t("resultLinked") : t("resultInvited")}
            </AlertDescription>
          </Alert>
        ) : null}
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <FormStatus error={formError} success={false} />
          <Field className="flex-1">
            <FieldLabel htmlFor="inviteEmail">{t("email")}</FieldLabel>
            <Input
              id="inviteEmail"
              name="email"
              type="email"
              defaultValue={defaultEmail ?? ""}
              aria-invalid={Boolean(fieldErrors["email"])}
            />
            <FieldError errors={errorsFor(fieldErrors, "email")} />
          </Field>
          <Button type="submit" variant="outline" disabled={pending}>
            {linkedEmail ? t("relink") : t("invite")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
