"use client";

import { useTranslations } from "next-intl";
import type { FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { errorsFor, useServerAction } from "@/components/forms/use-server-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { localeNames, routing } from "@/i18n/routing";
import type { ActionResult } from "@/lib/api/define-action";
import { AUDIENCES, SALON_CATEGORIES } from "@/modules/salons/schemas";

export type SalonProfileFormValues = {
  name: string;
  description: string | null;
  category: string | null;
  audience: "MALE" | "FEMALE" | "UNISEX";
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  googleMapsUrl: string | null;
  brandColor: string | null;
  defaultLocale: string;
};

type Props = {
  salonSlug: string;
  initial: SalonProfileFormValues;
  action: (input: unknown) => Promise<ActionResult<{ name: string; updatedAt: string }>>;
};

const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function SalonProfileForm({ salonSlug, initial, action }: Props) {
  const t = useTranslations("salonAdmin.profile");
  const tSalons = useTranslations("salons");
  const router = useRouter();
  const { run, pending, fieldErrors, formError, success } = useServerAction(action, {
    onSuccess: () => router.refresh(),
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => (form.get(key) as string | null) ?? "";
    await run({
      salonSlug,
      name: value("name"),
      description: value("description"),
      category: value("category") || null,
      audience: value("audience"),
      address: value("address"),
      city: value("city"),
      postalCode: value("postalCode"),
      country: value("country"),
      phone: value("phone"),
      email: value("email"),
      website: value("website"),
      instagram: value("instagram"),
      facebook: value("facebook"),
      tiktok: value("tiktok"),
      googleMapsUrl: value("googleMapsUrl"),
      brandColor: value("brandColor"),
      defaultLocale: value("defaultLocale"),
    });
  }

  const text = (
    name: keyof SalonProfileFormValues,
    label: string,
    extra: Partial<React.ComponentProps<typeof Input>> = {},
  ) => (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        defaultValue={(initial[name] as string | null) ?? ""}
        aria-invalid={Boolean(fieldErrors[name])}
        {...extra}
      />
      <FieldError errors={errorsFor(fieldErrors, name)} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus error={formError} success={success} />

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.general")}</CardTitle>
          <CardDescription>{t("sections.generalHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {text("name", tSalons("fields.name"), { required: true })}
            <Field>
              <FieldLabel htmlFor="description">{t("fields.description")}</FieldLabel>
              <Textarea
                id="description"
                name="description"
                rows={5}
                defaultValue={initial.description ?? ""}
                aria-invalid={Boolean(fieldErrors["description"])}
              />
              <FieldDescription>{t("fields.descriptionHint")}</FieldDescription>
              <FieldError errors={errorsFor(fieldErrors, "description")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="category">{t("fields.category")}</FieldLabel>
                <select
                  id="category"
                  name="category"
                  defaultValue={initial.category ?? ""}
                  className={selectClass}
                >
                  <option value="">—</option>
                  {SALON_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="audience">{tSalons("fields.audience")}</FieldLabel>
                <select
                  id="audience"
                  name="audience"
                  defaultValue={initial.audience}
                  className={selectClass}
                >
                  {AUDIENCES.map((a) => (
                    <option key={a} value={a}>
                      {tSalons(`audience.${a}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="defaultLocale">{tSalons("fields.defaultLocale")}</FieldLabel>
                <select
                  id="defaultLocale"
                  name="defaultLocale"
                  defaultValue={initial.defaultLocale}
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
            <Field>
              <FieldLabel htmlFor="brandColor">{t("fields.brandColor")}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="brandColor"
                  name="brandColor"
                  placeholder="#0f766e"
                  defaultValue={initial.brandColor ?? ""}
                  className="max-w-40"
                  aria-invalid={Boolean(fieldErrors["brandColor"])}
                />
              </div>
              <FieldDescription>{t("fields.brandColorHint")}</FieldDescription>
              <FieldError errors={errorsFor(fieldErrors, "brandColor")} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.location")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {text("address", t("fields.address"), { autoComplete: "street-address" })}
            <div className="grid gap-4 sm:grid-cols-3">
              {text("city", t("fields.city"))}
              {text("postalCode", t("fields.postalCode"))}
              {text("country", t("fields.country"), { placeholder: "BA", maxLength: 2 })}
            </div>
            {text("googleMapsUrl", t("fields.googleMapsUrl"), {
              type: "url",
              placeholder: "https://maps.app.goo.gl/…",
            })}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.contact")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("phone", t("fields.phone"), { type: "tel" })}
              {text("email", t("fields.email"), { type: "email" })}
            </div>
            {text("website", t("fields.website"), { type: "url", placeholder: "https://" })}
            <div className="grid gap-4 sm:grid-cols-3">
              {text("instagram", "Instagram", {
                type: "url",
                placeholder: "https://instagram.com/…",
              })}
              {text("facebook", "Facebook", { type: "url", placeholder: "https://facebook.com/…" })}
              {text("tiktok", "TikTok", { type: "url", placeholder: "https://tiktok.com/@…" })}
            </div>
          </FieldGroup>
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
