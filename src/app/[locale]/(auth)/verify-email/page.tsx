import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ResendVerificationButton } from "@/components/auth/resend-verification-button";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/verify-email">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.verify" });
  return { title: t("title") };
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: PageProps<"/[locale]/verify-email">) {
  await resolveLocaleParam(params);
  const t = await getTranslations("auth.verify");
  const { email } = await searchParams;
  const address = typeof email === "string" ? email : null;

  return (
    <AuthCard
      title={t("title")}
      description={address ? t("subtitle", { email: address }) : t("subtitleNoEmail")}
    >
      <div className="flex flex-col items-center gap-6">
        <MailCheck className="size-12 text-muted-foreground" aria-hidden />
        <div className="flex w-full flex-col gap-3">
          {address ? <ResendVerificationButton email={address} /> : null}
          <Button variant="ghost" render={<Link href="/account" />}>
            {t("continue")}
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
