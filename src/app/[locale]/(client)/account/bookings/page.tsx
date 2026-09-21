import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BookingCard } from "@/components/booking/booking-card";
import { ManageBooking } from "@/components/booking/manage-booking";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { cn } from "@/lib/utils";
import { listBookingsForUser } from "@/modules/booking";

import { requireClient } from "../_context";

const SCOPES = ["upcoming", "past", "cancelled"] as const;
type Scope = (typeof SCOPES)[number];

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/bookings">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "account.bookings" });
  return { title: t("title") };
}

export default async function AccountBookingsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/account/bookings">) {
  const locale = await resolveLocaleParam(params);
  const sp = await searchParams;
  const scope: Scope = SCOPES.includes(sp.scope as Scope) ? (sp.scope as Scope) : "upcoming";
  const actor = await requireClient(locale, `/account/bookings?scope=${scope}`);
  const [t, bookings] = await Promise.all([
    getTranslations("account.bookings"),
    listBookingsForUser(actor.userId, scope),
  ]);

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      <div
        className="mt-6 flex gap-1 rounded-lg border p-0.5"
        role="tablist"
        aria-label={t("title")}
      >
        {SCOPES.map((s) => (
          <Link
            key={s}
            href={{ pathname: "/account/bookings", query: { scope: s } }}
            role="tab"
            aria-selected={scope === s}
            data-testid={`bookings-tab-${s}`}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-center text-sm",
              scope === s ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {t(`scopes.${s}`)}
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-6" data-testid={`bookings-${scope}`}>
        {bookings.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">{t(`empty.${scope}`)}</p>
            {scope === "upcoming" ? (
              <Button className="mt-4" size="sm" render={<Link href="/" />}>
                {t("findSalon")}
              </Button>
            ) : null}
          </div>
        ) : (
          bookings.map((booking) => {
            const serialized = {
              ...booking,
              startsAt: booking.startsAt.toISOString(),
              policy: {
                ...booking.policy,
                cancelUntil: booking.policy.cancelUntil.toISOString(),
                rescheduleUntil: booking.policy.rescheduleUntil.toISOString(),
              },
            };
            return scope === "upcoming" ? (
              <ManageBooking
                key={booking.id}
                booking={serialized}
                endpoints={{
                  availability: `/api/v1/public/salons/${booking.salon.slug}/availability`,
                  cancel: `/api/v1/me/bookings/${booking.id}/cancel`,
                  reschedule: `/api/v1/me/bookings/${booking.id}/reschedule`,
                }}
              />
            ) : (
              <BookingCard key={booking.id} booking={serialized} />
            );
          })
        )}
      </div>
    </section>
  );
}
