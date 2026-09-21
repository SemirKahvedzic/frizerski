"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { localeNames, routing } from "@/i18n/routing";
import type { ActionResult } from "@/lib/api/define-action";
import { slugify } from "@/lib/slug";
import { AUDIENCES, SUPPORTED_CURRENCIES } from "@/modules/salons/schemas";

type CreateResult = { id: string; slug: string; name: string };

const TIMEZONES = [
  "Europe/Sarajevo",
  "Europe/Zagreb",
  "Europe/Belgrade",
  "Europe/Vienna",
  "Europe/Berlin",
  "Europe/Zurich",
  "Europe/London",
];

export function CreateSalonForm({
  action,
}: {
  action: (input: unknown) => Promise<ActionResult<CreateResult>>;
}) {
  const t = useTranslations("salons");
  const tRoot = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function translateKey(message: string): string {
    return message.startsWith("salons.") || message.startsWith("auth.")
      ? tRoot(message as never)
      : message;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await action({
      name: form.get("name"),
      slug: form.get("slug"),
      audience: form.get("audience"),
      timezone: form.get("timezone"),
      currency: form.get("currency"),
      defaultLocale: form.get("defaultLocale"),
    });
    setPending(false);

    if (!result.ok) {
      if (result.error.fieldErrors) {
        const translated: Record<string, string> = {};
        for (const [key, message] of Object.entries(result.error.fieldErrors)) {
          translated[key] = translateKey(message);
        }
        setFieldErrors(translated);
      }
      if (result.error.code === "CONFLICT") {
        setFieldErrors((prev) => ({ ...prev, slug: t("errors.slugTaken") }));
      } else if (result.error.code === "FORBIDDEN") {
        setFormError(t("errors.verifyFirst"));
      } else if (result.error.code !== "VALIDATION_ERROR") {
        setFormError(tRoot(`errors.codes.${result.error.code}` as never));
      }
      return;
    }

    router.push(`/admin/${result.data.slug}`);
    router.refresh();
  }

  const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">{t("fields.name")}</FieldLabel>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            required
            aria-invalid={Boolean(fieldErrors["name"])}
          />
          <FieldError
            errors={fieldErrors["name"] ? [{ message: fieldErrors["name"] }] : undefined}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="slug">{t("fields.slug")}</FieldLabel>
          <div className="flex items-center gap-1">
            <span className="shrink-0 text-sm text-muted-foreground">/salon/</span>
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              aria-invalid={Boolean(fieldErrors["slug"])}
            />
          </div>
          <FieldDescription>{t("fields.slugHint")}</FieldDescription>
          <FieldError
            errors={fieldErrors["slug"] ? [{ message: fieldErrors["slug"] }] : undefined}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="audience">{t("fields.audience")}</FieldLabel>
          <select id="audience" name="audience" defaultValue="UNISEX" className={selectClass}>
            {AUDIENCES.map((value) => (
              <option key={value} value={value}>
                {t(`audience.${value}`)}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="timezone">{t("fields.timezone")}</FieldLabel>
            <select
              id="timezone"
              name="timezone"
              defaultValue="Europe/Sarajevo"
              className={selectClass}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="currency">{t("fields.currency")}</FieldLabel>
            <select id="currency" name="currency" defaultValue="BAM" className={selectClass}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="defaultLocale">{t("fields.defaultLocale")}</FieldLabel>
            <select
              id="defaultLocale"
              name="defaultLocale"
              defaultValue={locale}
              className={selectClass}
            >
              {routing.locales.map((code) => (
                <option key={code} value={code}>
                  {localeNames[code]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FieldGroup>

      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {t("create.submit")}
      </Button>
    </form>
  );
}
