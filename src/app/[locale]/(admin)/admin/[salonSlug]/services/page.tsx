import { Plus, Scissors } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CategoriesPanel } from "@/components/admin/categories-panel";
import { PageHeader } from "@/components/admin/page-header";
import { ServicesList } from "@/components/admin/services-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { listEmployees } from "@/modules/employees";
import { listCategories, listServices } from "@/modules/services";

import { getAdminContext } from "../_context";
import {
  createCategoryAction,
  deleteCategoryAction,
  deleteServiceAction,
  renameCategoryAction,
  reorderServicesAction,
  setServiceActiveAction,
} from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/services">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("services") };
}

export default async function ServicesPage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/services">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const [services, categories, employees, t] = await Promise.all([
    listServices(ctx, { includeInactive: true }),
    listCategories(ctx),
    listEmployees(ctx, { includeInactive: true }),
    getTranslations("services"),
  ]);
  const employeeNames = employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button render={<Link href={`/admin/${salonSlug}/services/new`} />}>
            <Plus aria-hidden /> {t("new")}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          {services.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
                <Scissors className="size-8" aria-hidden />
                <p>{t("empty")}</p>
                <Button
                  variant="outline"
                  render={<Link href={`/admin/${salonSlug}/services/new`} />}
                >
                  {t("new")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ServicesList
              salonSlug={salonSlug}
              services={services}
              categories={categories}
              employees={employeeNames}
              reorderAction={reorderServicesAction}
              setActiveAction={setServiceActiveAction}
              deleteAction={deleteServiceAction}
            />
          )}
        </div>
        <CategoriesPanel
          salonSlug={salonSlug}
          categories={categories}
          createAction={createCategoryAction}
          renameAction={renameCategoryAction}
          deleteAction={deleteCategoryAction}
        />
      </div>
    </>
  );
}
