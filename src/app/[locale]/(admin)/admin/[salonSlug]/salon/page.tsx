import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { SalonProfileForm } from "@/components/admin/salon-profile-form";
import { resolveLocaleParam } from "@/i18n/params";
import { imageViewsFor } from "@/modules/media";
import { getSalonProfile } from "@/modules/salons";

import { getAdminContext } from "../_context";
import { updateSalonProfileAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/salon">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("salon") };
}

export default async function SalonProfilePage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/salon">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const [salon, t] = await Promise.all([
    getSalonProfile(ctx),
    getTranslations("salonAdmin.profile"),
  ]);

  const images = await imageViewsFor(ctx, [salon.logoImageId, salon.coverImageId]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <SalonProfileForm
        salonSlug={salon.slug}
        salonId={ctx.salonId}
        images={{
          logo: salon.logoImageId ? (images.get(salon.logoImageId) ?? null) : null,
          cover: salon.coverImageId ? (images.get(salon.coverImageId) ?? null) : null,
        }}
        initial={salon}
        action={updateSalonProfileAction}
      />
    </>
  );
}
