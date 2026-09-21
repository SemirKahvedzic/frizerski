"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { BookingCard, type BookingCardData } from "@/components/booking/booking-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type ManageableBooking = BookingCardData & {
  version: number;
  service: { id: string; name: string };
  employee: { id: string; firstName: string; lastName: string };
  policy: {
    canCancel: boolean;
    cancelUntil: string;
    canReschedule: boolean;
    rescheduleUntil: string;
  };
};

type Endpoints = { availability: string; cancel: string; reschedule: string };

/**
 * Cancel / reschedule controls shared by the guest page (token endpoints)
 * and the client dashboard (session endpoints).
 */
export function ManageBooking({
  booking,
  endpoints,
  showSalon = true,
}: {
  booking: ManageableBooking;
  endpoints: Endpoints;
  showSalon?: boolean;
}) {
  const t = useTranslations("manage");
  const format = useFormatter();
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel">("idle");
  const [date, setDate] = useState(booking.startsAt.slice(0, 10));
  const [slots, setSlots] = useState<{ startsAt: string }[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const loadSlots = useCallback(async () => {
    const response = await fetch(
      `${endpoints.availability}?serviceId=${booking.service.id}&employeeId=${booking.employee.id}&date=${date}`,
    );
    const body = await response.json();
    setSlots(response.ok ? body.data.slots : []);
  }, [endpoints.availability, booking.service.id, booking.employee.id, date]);

  useEffect(() => {
    if (mode !== "reschedule") return;
    const id = setTimeout(() => void loadSlots(), 0);
    return () => clearTimeout(id);
  }, [mode, loadSlots]);

  async function call(url: string, payload: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        const code = body.error?.code as string;
        setMessage({
          kind: "error",
          text:
            code === "SLOT_UNAVAILABLE"
              ? t("errors.slotTaken")
              : code === "POLICY_VIOLATION"
                ? t("errors.policy")
                : (body.error?.message ?? t("errors.generic")),
        });
        if (code === "SLOT_UNAVAILABLE") await loadSlots();
        return;
      }
      setMessage({ kind: "ok", text: okText });
      setMode("idle");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const active = booking.status === "PENDING" || booking.status === "CONFIRMED";

  return (
    <div className="space-y-4">
      <BookingCard booking={booking} showSalon={showSalon} />
      {message ? (
        <Alert variant={message.kind === "error" ? "destructive" : undefined}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      {active ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {booking.policy.canCancel
              ? t("cancelUntil", {
                  when: format.dateTime(new Date(booking.policy.cancelUntil), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: booking.salon.timezone,
                  }),
                })
              : t("cutoffPassed", { phone: booking.salon.phone ?? "—" })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!booking.policy.canReschedule || busy}
              onClick={() => setMode(mode === "reschedule" ? "idle" : "reschedule")}
            >
              {t("reschedule")}
            </Button>
            <Button
              variant="destructive"
              disabled={!booking.policy.canCancel || busy}
              onClick={() => setMode(mode === "cancel" ? "idle" : "cancel")}
            >
              {t("cancel")}
            </Button>
          </div>

          {mode === "cancel" ? (
            <div className="rounded-lg border p-4">
              <p className="text-sm">{t("cancelConfirm")}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    call(endpoints.cancel, { version: booking.version }, t("cancelled"))
                  }
                  data-testid="confirm-cancel"
                >
                  {t("cancelYes")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMode("idle")}>
                  {t("cancelNo")}
                </Button>
              </div>
            </div>
          ) : null}

          {mode === "reschedule" ? (
            <div className="space-y-3 rounded-lg border p-4">
              <label className="flex items-center gap-2 text-sm">
                <span>{t("newDate")}</span>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="max-w-44"
                  aria-label={t("newDate")}
                />
              </label>
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noSlots")}</p>
              ) : (
                <ul
                  className="grid grid-cols-3 gap-2 sm:grid-cols-5"
                  data-testid="reschedule-slots"
                >
                  {slots.map((s) => (
                    <li key={s.startsAt}>
                      <button
                        type="button"
                        onClick={() => setChosen(s.startsAt)}
                        className={cn(
                          "w-full rounded-lg border px-2 py-2 text-sm tabular-nums hover:border-primary",
                          chosen === s.startsAt && "bg-primary text-primary-foreground",
                        )}
                      >
                        {format.dateTime(new Date(s.startsAt), {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: booking.salon.timezone,
                        })}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                size="sm"
                disabled={!chosen || busy}
                onClick={() =>
                  chosen &&
                  call(
                    endpoints.reschedule,
                    { startsAt: chosen, version: booking.version },
                    t("rescheduled"),
                  )
                }
                data-testid="confirm-reschedule"
              >
                {t("rescheduleConfirm")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
