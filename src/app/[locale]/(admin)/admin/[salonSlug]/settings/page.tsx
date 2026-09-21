import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { SalonSettingsForm } from "@/components/admin/salon-settings-form";
import { resolveLocaleParam } from "@/i18n/params";
import { getSalonSettings } from "@/modules/salons";

import { getAdminContext } from "../_context";
import { updateSalonSettingsAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/settings">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("settings") };
}

export default async function SalonSettingsPage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/settings">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const [settings, t] = await Promise.all([
    getSalonSettings(ctx),
    getTranslations("salonAdmin.settings"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <SalonSettingsForm
        salonSlug={ctx.salonSlug}
        initial={settings}
        action={updateSalonSettingsAction}
      />
    </>
  );
}
