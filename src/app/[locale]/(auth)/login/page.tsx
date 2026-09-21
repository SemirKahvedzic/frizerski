import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { resolveLocaleParam } from "@/i18n/params";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/login">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("title") };
}

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  await resolveLocaleParam(params);
  const t = await getTranslations("auth.login");

  return (
    <AuthCard title={t("title")} description={t("subtitle")}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
