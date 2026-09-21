import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { ServiceForm } from "@/components/admin/service-form";
import { resolveLocaleParam } from "@/i18n/params";
import { imageViewsFor } from "@/modules/media";
import { isAppError } from "@/lib/errors";
import { listEmployees } from "@/modules/employees";
import { getSalon } from "@/modules/salons";
import { getService, listCategories } from "@/modules/services";

import { getAdminContext } from "../../_context";
import { updateServiceAction } from "../actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/services/[serviceId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("services") };
}

export default async function EditServicePage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/services/[serviceId]">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug, serviceId } = await params;
  const ctx = await getAdminContext(locale, salonSlug);

  let service;
  try {
    service = await getService(ctx, serviceId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [salon, categories, employees, t] = await Promise.all([
    getSalon(ctx),
    listCategories(ctx),
    listEmployees(ctx, { includeInactive: true }),
    getTranslations("services"),
  ]);

  const image = service.imageId
    ? ((await imageViewsFor(ctx, [service.imageId])).get(service.imageId) ?? null)
    : null;

  return (
    <>
      <PageHeader title={service.name} description={t("editSubtitle")} />
      <ServiceForm
        salonSlug={salonSlug}
        salonId={ctx.salonId}
        image={image}
        serviceId={serviceId}
        currency={salon.currency}
        initial={service}
        categories={categories}
        employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))}
        action={updateServiceAction}
      />
    </>
  );
}
