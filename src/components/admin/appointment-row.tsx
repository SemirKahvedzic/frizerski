"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";
import { formatMoney } from "@/lib/money";

export type AppointmentRowData = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  startsAt: string;
  endsAt: string;
  priceCents: number;
  currency: string;
  version: number;
  source: "ONLINE" | "ADMIN" | "WALK_IN";
  service: { name: string };
  employee: { firstName: string; lastName: string; color: string | null };
  customer: { firstName: string; lastName: string; email: string; phone: string | null };
  clientNotes: string | null;
};

type Transition = "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

const STATUS_VARIANT = {
  PENDING: "secondary",
  CONFIRMED: "default",
  COMPLETED: "outline",
  CANCELLED: "destructive",
  NO_SHOW: "destructive",
} as const;

export function AppointmentRow({
  salonSlug,
  timezone,
  booking,
  transitions,
  action,
}: {
  salonSlug: string;
  timezone: string;
  booking: AppointmentRowData;
  transitions: Transition[];
  action: (
    input: unknown,
  ) => Promise<ActionResult<{ id: string; status: string; version: number }>>;
}) {
  const t = useTranslations("appointments");
  const tStatus = useTranslations("bookingStatus");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(status: Transition) {
    setBusy(true);
    setError(null);
    const result = await action({
      salonSlug,
      bookingId: booking.id,
      status,
      version: booking.version,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <li
      className="flex flex-wrap items-center gap-3 px-4 py-3"
      data-testid={`appointment-${booking.id}`}
    >
      <div className="w-20 shrink-0 text-sm font-medium tabular-nums">
        {format.dateTime(new Date(booking.startsAt), {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: timezone,
        })}
        <div className="text-xs text-muted-foreground">
          {format.dateTime(new Date(booking.endsAt), {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: timezone,
          })}
        </div>
      </div>
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: booking.employee.color ?? "#475569" }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {booking.customer.firstName} {booking.customer.lastName}
          </span>
          <Badge variant={STATUS_VARIANT[booking.status]}>{tStatus(booking.status)}</Badge>
          {booking.source !== "ONLINE" ? (
            <Badge variant="outline">{t(`source.${booking.source}`)}</Badge>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {booking.service.name} · {booking.employee.firstName} {booking.employee.lastName} ·{" "}
          {formatMoney(booking.priceCents, booking.currency, locale)}
          {booking.customer.phone ? ` · ${booking.customer.phone}` : ""}
        </div>
        {booking.clientNotes ? (
          <div className="mt-1 text-xs text-muted-foreground italic">“{booking.clientNotes}”</div>
        ) : null}
        {error ? <div className="mt-1 text-xs text-destructive">{error}</div> : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {transitions.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={status === "CANCELLED" || status === "NO_SHOW" ? "destructive" : "outline"}
            disabled={busy}
            onClick={() => change(status)}
          >
            {t(`actions.${status}`)}
          </Button>
        ))}
      </div>
    </li>
  );
}
