import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { ServiceForm } from "@/components/admin/service-form";
import { resolveLocaleParam } from "@/i18n/params";
import { listEmployees } from "@/modules/employees";
import { getSalon } from "@/modules/salons";
import { listCategories } from "@/modules/services";

import { getAdminContext } from "../../_context";
import { createServiceAction } from "../actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/services/new">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "services" });
  return { title: t("new") };
}

export default async function NewServicePage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/services/new">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const [salon, categories, employees, t] = await Promise.all([
    getSalon(ctx),
    listCategories(ctx),
    listEmployees(ctx),
    getTranslations("services"),
  ]);

  return (
    <>
      <PageHeader title={t("new")} description={t("newSubtitle")} />
      <ServiceForm
        salonSlug={salonSlug}
        salonId={ctx.salonId}
        currency={salon.currency}
        categories={categories}
        employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))}
        action={createServiceAction}
      />
    </>
  );
}
