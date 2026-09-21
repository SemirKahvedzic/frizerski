import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { GalleryManager } from "@/components/admin/gallery-manager";
import { PageHeader } from "@/components/admin/page-header";
import { resolveLocaleParam } from "@/i18n/params";
import { listGallery } from "@/modules/media";

import { getAdminContext } from "../_context";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/gallery">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("gallery") };
}

export default async function GalleryPage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/gallery">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const [items, t] = await Promise.all([listGallery(ctx), getTranslations("gallery")]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <GalleryManager salonId={ctx.salonId} items={items} />
    </>
  );
}
