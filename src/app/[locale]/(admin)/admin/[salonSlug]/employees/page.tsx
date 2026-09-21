import { Plus, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { listEmployees } from "@/modules/employees";

import { getAdminContext } from "../_context";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/employees">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("employees") };
}

export default async function EmployeesPage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/employees">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const ctx = await getAdminContext(locale, salonSlug);
  const [employees, t, tSalons] = await Promise.all([
    listEmployees(ctx, { includeInactive: true }),
    getTranslations("employees"),
    getTranslations("salons"),
  ]);
  const base = `/admin/${salonSlug}/employees`;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button render={<Link href={`${base}/new`} />}>
            <Plus aria-hidden /> {t("new")}
          </Button>
        }
      />
      {employees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <UserRound className="size-8" aria-hidden />
            <p>{t("empty")}</p>
            <Button variant="outline" render={<Link href={`${base}/new`} />}>
              {t("new")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((e) => (
            <li key={e.id}>
              <Link
                href={`${base}/${e.id}`}
                className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
                data-testid={`employee-card-${e.id}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: e.color ?? "#475569" }}
                  >
                    {e.firstName.charAt(0)}
                    {e.lastName.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {e.firstName} {e.lastName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.position ?? tSalons(`audience.${e.audience}`)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {!e.isActive ? <Badge variant="destructive">{t("badges.inactive")}</Badge> : null}
                  {e.isActive && !e.isBookableOnline ? (
                    <Badge variant="secondary">{t("badges.notBookable")}</Badge>
                  ) : null}
                  {e.userId ? <Badge variant="outline">{t("badges.hasAccess")}</Badge> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
