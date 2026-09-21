import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ProfileForm } from "@/components/account/profile-form";
import { resolveLocaleParam } from "@/i18n/params";
import { getProfile } from "@/modules/account";

import { requireClient } from "../_context";
import { updateProfileAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/profile">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "account.profile" });
  return { title: t("title") };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/account/profile">) {
  const locale = await resolveLocaleParam(params);
  const actor = await requireClient(locale, "/account/profile");
  const [t, profile] = await Promise.all([
    getTranslations("account.profile"),
    getProfile(actor.userId),
  ]);

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      <div className="mt-6">
        <ProfileForm initial={profile} action={updateProfileAction} />
      </div>
    </section>
  );
}
