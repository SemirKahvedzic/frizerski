import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { resolveLocaleParam } from "@/i18n/params";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/register">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.register" });
  return { title: t("title") };
}

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  await resolveLocaleParam(params);
  const t = await getTranslations("auth.register");

  return (
    <AuthCard title={t("title")} description={t("subtitle")}>
      <RegisterForm />
    </AuthCard>
  );
}
