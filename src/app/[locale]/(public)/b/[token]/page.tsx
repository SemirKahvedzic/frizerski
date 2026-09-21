import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ManageBooking } from "@/components/booking/manage-booking";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { isAppError } from "@/lib/errors";
import { getBookingByToken } from "@/modules/booking";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/b/[token]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "manage" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ManageByTokenPage({ params }: PageProps<"/[locale]/b/[token]">) {
  await resolveLocaleParam(params);
  const { token } = await params;
  let booking;
  try {
    booking = await getBookingByToken(token);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [t, common] = await Promise.all([getTranslations("manage"), getTranslations("common")]);

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {common("appName")}
        </Link>
        <LocaleSwitcher />
      </header>
      <section className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-6">
          <ManageBooking
            booking={{
              ...booking,
              startsAt: booking.startsAt.toISOString(),
              policy: {
                ...booking.policy,
                cancelUntil: booking.policy.cancelUntil.toISOString(),
                rescheduleUntil: booking.policy.rescheduleUntil.toISOString(),
              },
            }}
            endpoints={{
              availability: `/api/v1/public/salons/${booking.salon.slug}/availability`,
              cancel: `/api/v1/bookings/manage/${token}/cancel`,
              reschedule: `/api/v1/bookings/manage/${token}/reschedule`,
            }}
          />
        </div>
      </section>
    </main>
  );
}
