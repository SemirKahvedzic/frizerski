import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { resolveLocaleParam } from "@/i18n/params";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.reset" });
  return { title: t("title") };
}

export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  await resolveLocaleParam(params);
  const t = await getTranslations("auth.reset");

  return (
    <AuthCard title={t("title")} description={t("subtitle")}>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
