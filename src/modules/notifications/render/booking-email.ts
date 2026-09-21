import { getTranslator } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/routing";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import type { BookingNotificationModel } from "@/modules/notifications/model";
import type { NotificationType, Recipient } from "@/modules/notifications/plan";
import { renderIcs } from "@/modules/notifications/render/ics";
import {
  renderEmailLayout,
  type EmailDetail,
} from "@/modules/notifications/email/templates/layout";

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  ics: string | null;
};

export type RenderContext = {
  /** Link the recipient uses to view/manage the booking. */
  manageUrl: string;
  previousStartsAt?: Date | null;
  reason?: string | null;
  now?: Date;
};

const INTL_LOCALE: Record<AppLocale, string> = { bs: "bs-BA", en: "en-GB" };

export function formatWhen(date: Date, timeZone: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function formatTime(date: Date, timeZone: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

/** Human-friendly booking reference derived from the UUID, e.g. `#7K3M-2Q1A`. */
export function shortBookingCode(id: string): string {
  const hex = id.replace(/-/g, "").toUpperCase();
  return `#${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

const CUSTOMER_TYPES: Record<string, string> = {
  BOOKING_PENDING: "pending",
  BOOKING_CONFIRMED: "confirmed",
  BOOKING_RESCHEDULED: "rescheduled",
  BOOKING_CANCELLED: "cancelled",
  REMINDER_24H: "reminder24h",
  REMINDER_1H: "reminder1h",
  STAFF_NEW_BOOKING: "staffNew",
  STAFF_BOOKING_RESCHEDULED: "staffRescheduled",
  STAFF_BOOKING_CANCELLED: "staffCancelled",
};

export async function renderBookingEmail(
  type: NotificationType,
  model: BookingNotificationModel,
  recipient: Recipient,
  ctx: RenderContext,
): Promise<RenderedEmail> {
  const locale = recipient.locale;
  const t = await getTranslator(locale);
  // Template keys are chosen at runtime; next-intl types cannot express that.
  const tr = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const tz = model.salon.timezone;
  const key = CUSTOMER_TYPES[type]!;
  const when = formatWhen(model.booking.startsAt, tz, locale);
  const endTime = formatTime(model.booking.endsAt, tz, locale);
  const vars = {
    salon: model.salon.name,
    service: model.service.name,
    employee: model.employeeName,
    customer: model.customerRecord.firstName + " " + model.customerRecord.lastName,
    when,
    time: formatTime(model.booking.startsAt, tz, locale),
    appName: env.APP_NAME,
  };

  const details: EmailDetail[] = [
    { label: t("emails.booking.labels.salon"), value: model.salon.name },
    { label: t("emails.booking.labels.service"), value: model.service.name },
    { label: t("emails.booking.labels.employee"), value: model.employeeName },
    { label: t("emails.booking.labels.when"), value: `${when} – ${endTime} (${tz})` },
    {
      label: t("emails.booking.labels.duration"),
      value: t("emails.booking.minutes", { count: model.booking.durationMinutes }),
    },
    {
      label: t("emails.booking.labels.price"),
      value: formatMoney(model.booking.priceCents, model.booking.currency, INTL_LOCALE[locale]),
    },
    { label: t("emails.booking.labels.code"), value: shortBookingCode(model.booking.id) },
  ];
  if (recipient.kind === "staff") {
    details.splice(0, 1, {
      label: t("emails.booking.labels.customer"),
      value: `${vars.customer} · ${model.customerRecord.email}${model.customerRecord.phone ? ` · ${model.customerRecord.phone}` : ""}`,
    });
    if (model.booking.clientNotes) {
      details.push({ label: t("emails.booking.labels.notes"), value: model.booking.clientNotes });
    }
  } else {
    const address = [model.salon.address, model.salon.city].filter(Boolean).join(", ");
    if (address) details.push({ label: t("emails.booking.labels.address"), value: address });
    if (model.salon.phone)
      details.push({ label: t("emails.booking.labels.phone"), value: model.salon.phone });
  }

  const afterDetails: string[] = [];
  if (ctx.previousStartsAt) {
    afterDetails.push(
      t("emails.booking.previous", { when: formatWhen(ctx.previousStartsAt, tz, locale) }),
    );
  }
  if (type === "BOOKING_CANCELLED" || type === "STAFF_BOOKING_CANCELLED") {
    const reason = ctx.reason ?? model.booking.cancellationReason;
    if (reason) afterDetails.push(t("emails.booking.reason", { reason }));
  }
  const active = model.booking.status === "PENDING" || model.booking.status === "CONFIRMED";
  if (recipient.kind === "customer" && active) {
    const cutoff = new Date(
      model.booking.startsAt.getTime() - model.salon.cancellationCutoffHours * 3_600_000,
    );
    if (cutoff.getTime() > (ctx.now ?? new Date()).getTime()) {
      afterDetails.push(t("emails.booking.policy", { when: formatWhen(cutoff, tz, locale) }));
    }
  }

  const { html, text } = renderEmailLayout({
    appName: env.APP_NAME,
    title: tr(`emails.booking.${key}.title`, vars),
    greeting: t("emails.common.greeting", { name: recipient.name }),
    paragraphs: [tr(`emails.booking.${key}.intro`, vars)],
    details,
    afterDetails,
    button: {
      label: t(recipient.kind === "staff" ? "emails.booking.openAdmin" : "emails.booking.manage"),
      url: ctx.manageUrl,
    },
    footer: [
      t("emails.booking.footer", { salon: model.salon.name, appName: env.APP_NAME }),
      t("emails.common.signature", { appName: env.APP_NAME }),
    ],
  });

  const wantsIcs =
    type === "BOOKING_CONFIRMED" || type === "BOOKING_RESCHEDULED" || type === "BOOKING_PENDING";
  const ics = wantsIcs
    ? renderIcs({
        uid: `${model.booking.id}@${new URL(env.APP_URL).hostname}`,
        sequence: model.booking.version,
        startsAt: model.booking.startsAt,
        endsAt: model.booking.endsAt,
        summary: `${model.service.name} – ${model.salon.name}`,
        description: t("emails.booking.icsDescription", vars),
        location: [model.salon.address, model.salon.city].filter(Boolean).join(", ") || undefined,
        url: ctx.manageUrl,
        stamp: ctx.now,
      })
    : null;

  return { subject: tr(`emails.booking.${key}.subject`, vars), html, text, ics };
}
