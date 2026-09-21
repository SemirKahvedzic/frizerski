import { AdminShell } from "@/components/admin/admin-shell";
import { resolveLocaleParam } from "@/i18n/params";
import { getSalon } from "@/modules/salons";

import { getAdminContext } from "./_context";

export default async function SalonAdminLayout({
  children,
  params,
}: LayoutProps<"/[locale]/admin/[salonSlug]">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const salon = await getSalon(ctx);

  return (
    <AdminShell
      salon={{ slug: salon.slug, name: salon.name, status: salon.status }}
      role={ctx.role}
    >
      {children}
    </AdminShell>
  );
}
