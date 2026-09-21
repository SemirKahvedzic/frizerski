import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmployeeForm } from "@/components/admin/employee-form";
import { PageHeader } from "@/components/admin/page-header";
import { resolveLocaleParam } from "@/i18n/params";

import { getAdminContext } from "../../_context";
import { createEmployeeAction } from "../actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/employees/new">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "employees" });
  return { title: t("new") };
}

export default async function NewEmployeePage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/employees/new">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const t = await getTranslations("employees");

  return (
    <>
      <PageHeader title={t("new")} description={t("newSubtitle")} />
      <EmployeeForm
        salonSlug={salonSlug}
        salonId={ctx.salonId}
        action={createEmployeeAction}
        onSaved="back"
      />
    </>
  );
}
