import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SalonStatusButtons } from "@/components/platform/salon-status-buttons";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, redirect } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { getCurrentPrincipal, isPlatformAdmin } from "@/modules/auth";
import { listSalons, platformStats } from "@/modules/platform";
import { platformContext } from "@/modules/tenant";

import { setSalonStatusAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/platform/salons">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "platform.salons" });
  return { title: t("title") };
}

const STATUS_VARIANT = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  SUSPENDED: "destructive",
} as const;

export default async function PlatformSalonsPage({
  params,
}: PageProps<"/[locale]/platform/salons">) {
  const locale = await resolveLocaleParam(params);
  const principal = await getCurrentPrincipal();
  if (principal.kind === "anonymous") {
    return redirect({
      href: { pathname: "/login", query: { next: `/${locale}/platform/salons` } },
      locale,
    });
  }
  if (!isPlatformAdmin(principal)) {
    notFound();
  }

  const ctx = platformContext(principal);
  const [page, stats, t, common, format] = await Promise.all([
    listSalons(ctx, { limit: 50 }),
    platformStats(ctx),
    getTranslations("platform"),
    getTranslations("common"),
    getFormatter(),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            {common("appName")}
          </Link>
          <Badge variant="outline">{t("badge")}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <SignOutButton />
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t("salons.title")}</h1>

        <dl className="mt-6 grid gap-4 sm:grid-cols-4">
          {(["ACTIVE", "INACTIVE", "SUSPENDED"] as const).map((status) => (
            <div key={status} className="rounded-xl border bg-card p-4">
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                {t(`salons.status.${status}`)}
              </dt>
              <dd className="mt-1 text-2xl font-semibold">{stats.salons[status]}</dd>
            </div>
          ))}
          <div className="rounded-xl border bg-card p-4">
            <dt className="text-xs font-medium text-muted-foreground uppercase">
              {t("stats.users")}
            </dt>
            <dd className="mt-1 text-2xl font-semibold">
              {stats.activeUsers}
              <span className="text-sm font-normal text-muted-foreground"> / {stats.users}</span>
            </dd>
          </div>
        </dl>

        <div className="mt-8 overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("salons.columns.name")}</TableHead>
                <TableHead>{t("salons.columns.owner")}</TableHead>
                <TableHead>{t("salons.columns.members")}</TableHead>
                <TableHead>{t("salons.columns.created")}</TableHead>
                <TableHead>{t("salons.columns.status")}</TableHead>
                <TableHead className="text-right">{t("salons.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t("salons.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                page.items.map((salon) => (
                  <TableRow key={salon.id} data-testid={`salon-row-${salon.slug}`}>
                    <TableCell>
                      <div className="font-medium">{salon.name}</div>
                      <div className="text-xs text-muted-foreground">/salon/{salon.slug}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {salon.owners.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        salon.owners.map((o) => <div key={o.userId}>{o.email}</div>)
                      )}
                    </TableCell>
                    <TableCell>{salon.memberCount}</TableCell>
                    <TableCell className="text-sm">
                      {format.dateTime(salon.createdAt, { dateStyle: "medium" })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[salon.status]}>
                        {t(`salons.status.${salon.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <SalonStatusButtons
                          salonId={salon.id}
                          status={salon.status}
                          action={setSalonStatusAction}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  );
}
