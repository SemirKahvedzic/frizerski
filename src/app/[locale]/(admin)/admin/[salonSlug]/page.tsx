import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { getCurrentPrincipal } from "@/modules/auth";
import { getSalon } from "@/modules/salons";
import { resolveTenantContext } from "@/modules/tenant";
import { isAppError } from "@/lib/errors";

/**
 * Salon admin entry point. The full dashboard shell arrives in the salon
 * management phase; this page proves tenant resolution end to end.
 */
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("title") };
}

export default async function SalonAdminPage({ params }: PageProps<"/[locale]/admin/[salonSlug]">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const principal = await getCurrentPrincipal();
  if (principal.kind === "anonymous") {
    return redirect({
      href: { pathname: "/login", query: { next: `/${locale}/admin/${salonSlug}` } },
      locale,
    });
  }

  let ctx;
  try {
    ctx = await resolveTenantContext(principal, { slug: salonSlug });
  } catch (error) {
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
    throw error;
  }

  const [salon, t, common] = await Promise.all([
    getSalon(ctx),
    getTranslations("admin"),
    getTranslations("common"),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            {common("appName")}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{salon.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <SignOutButton />
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{salon.name}</h1>
          <Badge variant="secondary">{t(`role.${ctx.role}`)}</Badge>
          <Badge variant={salon.status === "ACTIVE" ? "default" : "destructive"}>
            {t(`status.${salon.status}`)}
          </Badge>
        </div>
        <p className="mt-2 text-muted-foreground">{t("placeholder")}</p>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>{t("details")}</CardTitle>
            <CardDescription>/salon/{salon.slug}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("fields.audience")}</dt>
                <dd>{t(`audience.${salon.audience}`)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("fields.timezone")}</dt>
                <dd>{salon.timezone}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("fields.currency")}</dt>
                <dd>{salon.currency}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("fields.defaultLocale")}</dt>
                <dd>{salon.defaultLocale}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <p className="mt-8 text-sm">
          <Link href="/account" className="text-muted-foreground hover:underline">
            {t("backToAccount")}
          </Link>
        </p>
      </section>
    </main>
  );
}
