import { getTranslator } from "@/i18n/messages";
import type { BookingNotificationModel } from "@/modules/notifications/model";
import type { NotificationType, Recipient } from "@/modules/notifications/plan";
import type { PushMessage } from "@/modules/notifications/push/types";
import { formatWhen } from "@/modules/notifications/render/booking-email";

const KEYS: Record<NotificationType, string> = {
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

/** Short push payload: the email title plus a one-line summary. */
export async function renderPushMessage(
  type: NotificationType,
  model: BookingNotificationModel,
  recipient: Recipient,
  url: string,
): Promise<PushMessage> {
  const t = (await getTranslator(recipient.locale)) as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const when = formatWhen(model.booking.startsAt, model.salon.timezone, recipient.locale);
  const vars = {
    salon: model.salon.name,
    service: model.service.name,
    employee: model.employeeName,
    customer: `${model.customerRecord.firstName} ${model.customerRecord.lastName}`,
    when,
    time: when,
    appName: "",
  };
  const body =
    recipient.kind === "staff"
      ? `${vars.customer} · ${model.service.name} · ${when}`
      : `${model.service.name} · ${model.employeeName} · ${when}`;
  return {
    title: t(`emails.booking.${KEYS[type]}.title`, vars),
    body,
    url,
    tag: `booking:${model.booking.id}`,
    data: { bookingId: model.booking.id, type },
  };
}
