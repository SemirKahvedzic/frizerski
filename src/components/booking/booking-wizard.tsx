"use client";

import { ArrowLeft, CalendarCheck, Check, Loader2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SalonImage } from "@/components/media/salon-image";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { formatDuration, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ImageView } from "@/modules/media/image-view";

export type WizardService = {
  id: string;
  categoryId: string | null;
  name: string;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  audience: "MALE" | "FEMALE" | "UNISEX";
  employeeIds: string[];
};
export type WizardEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  color: string | null;
  avatar?: ImageView | null;
};
export type WizardCategory = { id: string; name: string };

type Slot = { startsAt: string; endsAt: string; employeeIds: string[] };

type Props = {
  salonSlug: string;
  salonName: string;
  timezone: string;
  allowAnyEmployee: boolean;
  allowGuestBooking: boolean;
  requirePhone: boolean;
  maxBookingAdvanceDays: number;
  services: WizardService[];
  categories: WizardCategory[];
  employees: WizardEmployee[];
  viewer: { name: string; email: string; phone: string | null } | null;
  initialServiceId?: string;
};

type Step = "service" | "employee" | "time" | "details" | "done";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookingWizard(props: Props) {
  const t = useTranslations("booking");
  const tAuth = useTranslations("auth");
  const format = useFormatter();
  const locale = useLocale();

  const [step, setStep] = useState<Step>(props.initialServiceId ? "employee" : "service");
  const [serviceId, setServiceId] = useState<string | null>(props.initialServiceId ?? null);
  const [employeeId, setEmployeeId] = useState<string | "any" | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState<string>(today);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [days, setDays] = useState<Record<string, boolean>>({});
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    id: string;
    manageUrl: string | null;
    startsAt: string;
  } | null>(null);

  const service = props.services.find((s) => s.id === serviceId) ?? null;
  const providers = useMemo(
    () => (service ? props.employees.filter((e) => service.employeeIds.includes(e.id)) : []),
    [service, props.employees],
  );
  const visibleDays = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(today, i)),
    [today],
  );

  const requestSeq = useRef(0);
  const loadSlots = useCallback(async () => {
    if (!service || !employeeId) return;
    // Only the latest request may update the list: a slower response for a
    // previously selected day must never overwrite the current selection.
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/public/salons/${props.salonSlug}/availability?serviceId=${service.id}&employeeId=${employeeId}&date=${date}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "error");
      if (seq !== requestSeq.current) return;
      setSlots(body.data.slots);
    } catch {
      if (seq !== requestSeq.current) return;
      setError(t("errors.loadSlots"));
      setSlots([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [service, employeeId, date, props.salonSlug, t]);

  useEffect(() => {
    if (step !== "time") return;
    // Deferred so the effect itself never sets state synchronously.
    const id = setTimeout(() => void loadSlots(), 0);
    return () => clearTimeout(id);
  }, [step, loadSlots]);

  useEffect(() => {
    if (step !== "time" || !service || !employeeId) return;
    const month = date.slice(0, 7);
    fetch(
      `/api/v1/public/salons/${props.salonSlug}/availability/summary?serviceId=${service.id}&employeeId=${employeeId}&month=${month}`,
    )
      .then((r) => r.json())
      .then((body) => setDays((prev) => ({ ...prev, ...(body.data?.days ?? {}) })))
      .catch(() => undefined);
  }, [step, service, employeeId, date, props.salonSlug]);

  function chooseService(id: string) {
    setServiceId(id);
    setEmployeeId(null);
    setSlot(null);
    setStep("employee");
  }

  function chooseEmployee(id: string | "any") {
    setEmployeeId(id);
    setSlot(null);
    setStep("time");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service || !employeeId || !slot) return;
    setLoading(true);
    setError(null);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const value = (k: string) => (form.get(k) as string | null) ?? "";
    const payload = {
      serviceId: service.id,
      employeeId:
        slot.employeeIds.length === 1 && employeeId === "any" ? slot.employeeIds[0] : employeeId,
      startsAt: slot.startsAt,
      notes: value("notes"),
      locale,
      customer: props.viewer
        ? { phone: value("phone") }
        : {
            firstName: value("firstName"),
            lastName: value("lastName"),
            email: value("email"),
            phone: value("phone"),
          },
    };
    try {
      const response = await fetch(`/api/v1/public/salons/${props.salonSlug}/bookings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        const code = body.error?.code as string | undefined;
        if (code === "VALIDATION_ERROR") {
          const issues = (body.error?.details?.issues ?? []) as { path: string; message: string }[];
          const next: Record<string, string> = {};
          for (const issue of issues)
            next[issue.path.replace(/^customer\./, "")] = tAuth.has(issue.message as never)
              ? tAuth(issue.message.replace(/^auth\./, "") as never)
              : issue.message;
          const fieldErrs = body.error?.details?.fieldErrors as Record<string, string> | undefined;
          if (fieldErrs)
            for (const [k, v] of Object.entries(fieldErrs))
              next[k.replace(/^customer\./, "")] = tAuth.has(v.replace(/^auth\./, "") as never)
                ? tAuth(v.replace(/^auth\./, "") as never)
                : v;
          setFieldErrors(next);
          setError(t("errors.validation"));
        } else if (code === "SLOT_UNAVAILABLE") {
          setError(t("errors.slotTaken"));
          setSlot(null);
          setStep("time");
          await loadSlots();
        } else {
          setError(body.error?.message ?? t("errors.generic"));
        }
        return;
      }
      setResult({ id: body.data.id, manageUrl: body.data.manageUrl, startsAt: body.data.startsAt });
      setStep("done");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  const timeLabel = (iso: string) =>
    format.dateTime(new Date(iso), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: props.timezone,
    });
  const dayLabel = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  const steps = ["service", "employee", "time", "details"] as const;
  const stepIndex = steps.indexOf(step as (typeof steps)[number]);

  return (
    <div className="space-y-6">
      {step !== "done" ? (
        <ol className="flex flex-wrap gap-2 text-xs" aria-label={t("progress")}>
          {steps.map((s, i) => (
            <li
              key={s}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1",
                i === stepIndex && "border-primary bg-primary text-primary-foreground",
                i < stepIndex && "text-muted-foreground",
              )}
            >
              {i < stepIndex ? <Check className="size-3" aria-hidden /> : null}
              {t(`steps.${s}`)}
            </li>
          ))}
        </ol>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === "service" ? (
        <div className="space-y-4" data-testid="step-service">
          <h2 className="text-lg font-semibold">{t("chooseService")}</h2>
          {[
            ...props.categories.map((c) => ({ id: c.id, name: c.name })),
            { id: null, name: t("otherServices") },
          ]
            .map((c) => ({ ...c, items: props.services.filter((s) => s.categoryId === c.id) }))
            .filter((c) => c.items.length > 0)
            .map((group) => (
              <div key={group.id ?? "none"}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.name}
                </h3>
                <ul className="grid gap-2">
                  {group.items.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => chooseService(s.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary"
                        disabled={s.employeeIds.length === 0}
                      >
                        <span>
                          <span className="block font-medium">{s.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(s.durationMinutes, { h: "h", min: "min" })}
                            {s.employeeIds.length === 0 ? ` · ${t("noProvider")}` : ""}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatMoney(s.priceCents, s.currency, locale)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      ) : null}

      {step === "employee" && service ? (
        <div className="space-y-4" data-testid="step-employee">
          <BackButton onClick={() => setStep("service")} label={t("back")} />
          <h2 className="text-lg font-semibold">{t("chooseEmployee")}</h2>
          <p className="text-sm text-muted-foreground">
            {service.name} · {formatDuration(service.durationMinutes, { h: "h", min: "min" })}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {props.allowAnyEmployee && providers.length > 1 ? (
              <li>
                <button
                  type="button"
                  onClick={() => chooseEmployee("any")}
                  className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    ✦
                  </span>
                  <span>
                    <span className="block font-medium">{t("anyEmployee")}</span>
                    <span className="text-xs text-muted-foreground">{t("anyEmployeeHint")}</span>
                  </span>
                </button>
              </li>
            ) : null}
            {providers.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => chooseEmployee(e.id)}
                  className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary"
                >
                  {e.avatar ? (
                    <SalonImage
                      image={e.avatar}
                      variant="thumb"
                      className="size-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="flex size-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ backgroundColor: e.color ?? "#475569" }}
                    >
                      {e.firstName.charAt(0)}
                      {e.lastName.charAt(0)}
                    </span>
                  )}
                  <span>
                    <span className="block font-medium">
                      {e.firstName} {e.lastName}
                    </span>
                    {e.position ? (
                      <span className="text-xs text-muted-foreground">{e.position}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === "time" && service ? (
        <div className="space-y-4" data-testid="step-time">
          <BackButton onClick={() => setStep("employee")} label={t("back")} />
          <h2 className="text-lg font-semibold">{t("chooseTime")}</h2>
          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
            role="listbox"
            aria-label={t("chooseDay")}
          >
            {visibleDays.map((d) => {
              const known = days[d];
              return (
                <button
                  key={d}
                  type="button"
                  role="option"
                  aria-selected={d === date}
                  onClick={() => {
                    setDate(d);
                    setSlot(null);
                    setSlots(null);
                  }}
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-2 text-sm",
                    d === date && "border-primary bg-primary text-primary-foreground",
                    known === false && "text-muted-foreground opacity-60",
                  )}
                >
                  {dayLabel(d)}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("otherDate")}</span>
            <Input
              type="date"
              value={date}
              min={today}
              max={addDays(today, props.maxBookingAdvanceDays)}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(e.target.value);
                  setSlot(null);
                  setSlots(null);
                }
              }}
              className="max-w-44"
              aria-label={t("otherDate")}
            />
          </label>
          {loading || slots === null ? (
            <p
              data-testid="slots-loading"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden /> {t("loadingSlots")}
            </p>
          ) : slots && slots.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="no-slots">
              {t("noSlots")}
            </p>
          ) : (
            <ul
              className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6"
              data-testid="slots"
            >
              {(slots ?? []).map((s) => (
                <li key={s.startsAt}>
                  <button
                    type="button"
                    onClick={() => {
                      setSlot(s);
                      setStep("details");
                    }}
                    className={cn(
                      "w-full rounded-lg border px-2 py-2 text-sm tabular-nums hover:border-primary",
                      slot?.startsAt === s.startsAt && "bg-primary text-primary-foreground",
                    )}
                  >
                    {timeLabel(s.startsAt)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {step === "details" && service && slot ? (
        <form onSubmit={submit} noValidate className="space-y-5" data-testid="step-details">
          <BackButton onClick={() => setStep("time")} label={t("back")} />
          <h2 className="text-lg font-semibold">{t("yourDetails")}</h2>
          <div className="rounded-xl border bg-muted/40 p-4 text-sm">
            <div className="font-medium">{service.name}</div>
            <div className="text-muted-foreground">
              {format.dateTime(new Date(slot.startsAt), {
                dateStyle: "full",
                timeStyle: "short",
                timeZone: props.timezone,
              })}{" "}
              · {formatDuration(service.durationMinutes, { h: "h", min: "min" })} ·{" "}
              {formatMoney(service.priceCents, service.currency, locale)}
            </div>
            <div className="text-muted-foreground">
              {employeeId === "any"
                ? t("withAny")
                : (() => {
                    const e = props.employees.find((x) => x.id === employeeId);
                    return e ? t("with", { name: `${e.firstName} ${e.lastName}` }) : null;
                  })()}
            </div>
          </div>
          <FieldGroup>
            {props.viewer ? (
              <p className="text-sm">
                {t("bookingAs", { name: props.viewer.name, email: props.viewer.email })}
              </p>
            ) : (
              <>
                {!props.allowGuestBooking ? (
                  <Alert>
                    <AlertDescription>
                      {t("signInRequired")}{" "}
                      <Link href="/login" className="underline">
                        {t("signIn")}
                      </Link>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="firstName">{tAuth("fields.firstName")}</FieldLabel>
                    <Input
                      id="firstName"
                      name="firstName"
                      autoComplete="given-name"
                      required
                      aria-invalid={Boolean(fieldErrors["firstName"])}
                    />
                    <FieldError
                      errors={
                        fieldErrors["firstName"]
                          ? [{ message: fieldErrors["firstName"] }]
                          : undefined
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="lastName">{tAuth("fields.lastName")}</FieldLabel>
                    <Input
                      id="lastName"
                      name="lastName"
                      autoComplete="family-name"
                      required
                      aria-invalid={Boolean(fieldErrors["lastName"])}
                    />
                    <FieldError
                      errors={
                        fieldErrors["lastName"] ? [{ message: fieldErrors["lastName"] }] : undefined
                      }
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="email">{tAuth("fields.email")}</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    aria-invalid={Boolean(fieldErrors["email"])}
                  />
                  <FieldError
                    errors={fieldErrors["email"] ? [{ message: fieldErrors["email"] }] : undefined}
                  />
                </Field>
              </>
            )}
            <Field>
              <FieldLabel htmlFor="phone">
                {props.requirePhone ? t("phone") : tAuth("fields.phone")}
              </FieldLabel>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                defaultValue={props.viewer?.phone ?? ""}
                required={props.requirePhone}
                aria-invalid={Boolean(fieldErrors["phone"])}
              />
              <FieldError
                errors={fieldErrors["phone"] ? [{ message: fieldErrors["phone"] }] : undefined}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="notes">{t("notes")}</FieldLabel>
              <Textarea id="notes" name="notes" rows={2} placeholder={t("notesPlaceholder")} />
            </Field>
          </FieldGroup>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={loading || (!props.viewer && !props.allowGuestBooking)}
          >
            {loading ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <CalendarCheck aria-hidden />
            )}
            {t("confirm")}
          </Button>
        </form>
      ) : null}

      {step === "done" && result && service ? (
        <div className="space-y-4 text-center" data-testid="step-done">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="size-7" aria-hidden />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{t("doneTitle")}</h2>
          <p className="text-muted-foreground">
            {t("doneSubtitle", {
              salon: props.salonName,
              when: format.dateTime(new Date(result.startsAt), {
                dateStyle: "full",
                timeStyle: "short",
                timeZone: props.timezone,
              }),
            })}
          </p>
          <Badge variant="secondary">{service.name}</Badge>
          <div className="flex flex-col justify-center gap-2 pt-2 sm:flex-row">
            {result.manageUrl ? (
              <Button render={<a href={result.manageUrl} />} data-testid="manage-link">
                {t("manageBooking")}
              </Button>
            ) : (
              <Button render={<Link href="/account" />}>{t("myAccount")}</Button>
            )}
            <Button variant="outline" render={<Link href={`/salon/${props.salonSlug}`} />}>
              {t("backToSalon")}
            </Button>
          </div>
          {result.manageUrl ? (
            <p className="text-xs text-muted-foreground">{t("manageHint")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} className="-ml-2">
      <ArrowLeft aria-hidden /> {label}
    </Button>
  );
}
