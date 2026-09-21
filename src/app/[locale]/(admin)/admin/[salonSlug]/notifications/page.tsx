import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { NotificationLog } from "@/components/admin/notification-log";
import { PageHeader } from "@/components/admin/page-header";
import { resolveLocaleParam } from "@/i18n/params";
import { getSalon } from "@/modules/salons";
import { listNotificationsForSalon } from "@/modules/notifications";

import { getAdminContext } from "../_context";
import { resendNotificationAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/notifications">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("notifications") };
}

export default async function NotificationsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/[salonSlug]/notifications">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug } = await params;
  const sp = await searchParams;
  const ctx = await getAdminContext(locale, salonSlug);
  const status =
    sp.status === "SENT" ||
    sp.status === "FAILED" ||
    sp.status === "SKIPPED" ||
    sp.status === "QUEUED"
      ? sp.status
      : undefined;
  const [t, salon, page] = await Promise.all([
    getTranslations("notificationsAdmin"),
    getSalon(ctx),
    listNotificationsForSalon(ctx, { limit: 100, status, channel: "EMAIL" }),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <NotificationLog
        salonSlug={ctx.salonSlug}
        timezone={salon.timezone}
        status={status ?? null}
        items={page.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          sentAt: item.sentAt?.toISOString() ?? null,
        }))}
        resend={resendNotificationAction}
      />
    </>
  );
}
