import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { NotificationPreferencesForm } from "@/components/account/notification-preferences-form";
import { resolveLocaleParam } from "@/i18n/params";
import { getNotificationPreferences } from "@/modules/account";

import { requireClient } from "../_context";
import { updateNotificationPreferencesAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/notifications">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "account.notifications" });
  return { title: t("title") };
}

export default async function NotificationsPage({
  params,
}: PageProps<"/[locale]/account/notifications">) {
  const locale = await resolveLocaleParam(params);
  const actor = await requireClient(locale, "/account/notifications");
  const [t, preferences] = await Promise.all([
    getTranslations("account.notifications"),
    getNotificationPreferences(actor.userId),
  ]);

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      <div className="mt-6">
        <NotificationPreferencesForm
          initial={preferences}
          action={updateNotificationPreferencesAction}
        />
      </div>
    </section>
  );
}
