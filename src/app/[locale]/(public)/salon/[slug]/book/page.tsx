import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BookingWizard } from "@/components/booking/booking-wizard";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { getCurrentActor } from "@/modules/auth";
import { getPublicSalon } from "@/modules/salons";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/salon/[slug]/book">): Promise<Metadata> {
  await resolveLocaleParam(params);
  const { slug } = await params;
  const salon = await getPublicSalon(slug, new Date().toISOString().slice(0, 10));
  const t = await getTranslations("booking");
  return { title: salon ? t("pageTitle", { salon: salon.name }) : t("title") };
}

export default async function BookPage({
  params,
  searchParams,
}: PageProps<"/[locale]/salon/[slug]/book">) {
  await resolveLocaleParam(params);
  const { slug } = await params;
  const { service } = await searchParams;
  const [salon, actor, t, common] = await Promise.all([
    getPublicSalon(slug, new Date().toISOString().slice(0, 10)),
    getCurrentActor(),
    getTranslations("booking"),
    getTranslations("common"),
  ]);
  if (!salon) notFound();

  const settings = await import("@/lib/db").then(({ prisma }) =>
    prisma.salonSettings.findUnique({
      where: { salonId: salon.id },
      select: { allowAnyEmployee: true, requirePhone: true },
    }),
  );
  const viewerPhone = actor
    ? await import("@/lib/db").then(({ prisma }) =>
        prisma.user.findUnique({ where: { id: actor.userId }, select: { phone: true } }),
      )
    : null;
  const initialServiceId =
    typeof service === "string" && salon.services.some((s) => s.id === service)
      ? service
      : undefined;

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href={`/salon/${salon.slug}`} className="text-lg font-semibold tracking-tight">
          {salon.name}
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          {actor ? (
            <Link href="/account" className="text-sm text-muted-foreground hover:underline">
              {common("appName")}
            </Link>
          ) : null}
        </div>
      </header>
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle", { timezone: salon.timezone })}
        </p>
        <div className="mt-6">
          <BookingWizard
            salonSlug={salon.slug}
            salonName={salon.name}
            timezone={salon.timezone}
            allowAnyEmployee={settings?.allowAnyEmployee ?? true}
            allowGuestBooking={salon.booking.allowGuestBooking}
            requirePhone={settings?.requirePhone ?? true}
            maxBookingAdvanceDays={salon.booking.maxBookingAdvanceDays}
            services={salon.services}
            categories={salon.categories}
            employees={salon.employees}
            viewer={
              actor
                ? { name: actor.name, email: actor.email, phone: viewerPhone?.phone ?? null }
                : null
            }
            initialServiceId={initialServiceId}
          />
        </div>
      </section>
    </main>
  );
}
