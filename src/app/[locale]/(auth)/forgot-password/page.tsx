import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { resolveLocaleParam } from "@/i18n/params";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.forgot" });
  return { title: t("title") };
}

export default async function ForgotPasswordPage({
  params,
}: PageProps<"/[locale]/forgot-password">) {
  await resolveLocaleParam(params);
  const t = await getTranslations("auth.forgot");

  return (
    <AuthCard title={t("title")} description={t("subtitle")}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
