import { BadgeCheck, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { ResendVerificationButton } from "@/components/auth/resend-verification-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { getCurrentActor } from "@/modules/auth";

const ROLE_KEYS = {
  OWNER: "roles.OWNER",
  ADMIN: "roles.ADMIN",
  EMPLOYEE: "roles.EMPLOYEE",
} as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title") };
}

export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const locale = await resolveLocaleParam(params);
  const actor = await getCurrentActor();
  if (!actor) {
    return redirect({
      href: { pathname: "/login", query: { next: `/${locale}/account` } },
      locale,
    });
  }

  const t = await getTranslations("account");
  const common = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {common("appName")}
        </Link>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <SignOutButton />
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("welcome", { name: actor.name })}
        </h1>

        {!actor.emailVerified ? (
          <Alert className="mt-6">
            <ShieldAlert aria-hidden />
            <AlertDescription className="flex flex-col gap-3">
              <span>{t("verifyBanner")}</span>
              <ResendVerificationButton
                email={actor.email}
                label={t("resendVerification")}
                variant="secondary"
              />
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("email")}</CardTitle>
              <CardDescription>{actor.email}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm">
              {actor.emailVerified ? (
                <>
                  <BadgeCheck className="size-4 text-emerald-600" aria-hidden />
                  <span>{t("verified")}</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="size-4 text-destructive" aria-hidden />
                  <span>{t("notVerified")}</span>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("memberships")}</CardTitle>
              {actor.platformRole === "SUPER_ADMIN" ? (
                <CardDescription>{t("platformAdmin")}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="text-sm">
              {actor.memberships.length === 0 ? (
                <p className="text-muted-foreground">{t("noMemberships")}</p>
              ) : (
                <ul className="space-y-1">
                  {actor.memberships.map((m) => (
                    <li key={m.salonId} className="flex justify-between gap-4">
                      <span className="font-mono text-xs">{m.salonId}</span>
                      <span>{t(ROLE_KEYS[m.role])}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <p className="mt-10 text-sm text-muted-foreground">{t("bookingsSoon")}</p>
      </section>
    </main>
  );
}
