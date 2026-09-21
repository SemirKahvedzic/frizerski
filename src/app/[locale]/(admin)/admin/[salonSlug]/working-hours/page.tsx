import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ClosuresPanel } from "@/components/admin/closures-panel";
import { PageHeader } from "@/components/admin/page-header";
import { WorkingHoursForm } from "@/components/admin/working-hours-form";
import { resolveLocaleParam } from "@/i18n/params";
import { localDateString } from "@/lib/time";
import { getSalon, getWorkingHours, listClosures } from "@/modules/salons";

import { getAdminContext } from "../_context";
import { addClosureAction, removeClosureAction, setWorkingHoursAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/working-hours">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("workingHours") };
}

export default async function WorkingHoursPage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/working-hours">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const salon = await getSalon(ctx);
  const today = localDateString(new Date(), salon.timezone);
  const [hours, closures, t] = await Promise.all([
    getWorkingHours(ctx),
    listClosures(ctx, { from: today }),
    getTranslations("salonAdmin.hours"),
  ]);

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        description={t("pageSubtitle", { timezone: salon.timezone })}
      />
      <div className="space-y-6">
        <WorkingHoursForm salonSlug={salon.slug} initial={hours} action={setWorkingHoursAction} />
        <ClosuresPanel
          salonSlug={salon.slug}
          closures={closures}
          addAction={addClosureAction}
          removeAction={removeClosureAction}
        />
      </div>
    </>
  );
}
