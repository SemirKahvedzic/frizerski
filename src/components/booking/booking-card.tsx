import { useFormatter, useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { formatDuration, formatMoney } from "@/lib/money";

export type BookingCardData = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  startsAt: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  service: { name: string };
  employee: { firstName: string; lastName: string };
  salon: {
    name: string;
    slug: string;
    timezone: string;
    address: string | null;
    phone: string | null;
  };
};

const STATUS_VARIANT = {
  PENDING: "secondary",
  CONFIRMED: "default",
  COMPLETED: "outline",
  CANCELLED: "destructive",
  NO_SHOW: "destructive",
} as const;

export function BookingCard({
  booking,
  showSalon = true,
}: {
  booking: BookingCardData;
  showSalon?: boolean;
}) {
  const t = useTranslations("bookingStatus");
  const tb = useTranslations("booking");
  const format = useFormatter();
  const locale = useLocale();
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={`booking-card-${booking.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium">{booking.service.name}</div>
          <div className="text-sm text-muted-foreground">
            {format.dateTime(new Date(booking.startsAt), {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: booking.salon.timezone,
            })}
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[booking.status]}>{t(booking.status)}</Badge>
      </div>
      <dl className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
        {showSalon ? (
          <div>
            <dt className="sr-only">{tb("salon")}</dt>
            <dd>
              {booking.salon.name}
              {booking.salon.address ? ` · ${booking.salon.address}` : ""}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">{tb("employee")}</dt>
          <dd>
            {tb("with", { name: `${booking.employee.firstName} ${booking.employee.lastName}` })} ·{" "}
            {formatDuration(booking.durationMinutes, { h: "h", min: "min" })} ·{" "}
            {formatMoney(booking.priceCents, booking.currency, locale)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
