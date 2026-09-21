import type { AppLocale } from "@/i18n/routing";

/**
 * Pure notification planning (docs/notifications.md §3): which recipients
 * get which notification type on which channel, and why a channel is skipped.
 * No I/O; exhaustively unit-tested.
 */
export type NotificationType =
  | "BOOKING_PENDING"
  | "BOOKING_CONFIRMED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_CANCELLED"
  | "REMINDER_24H"
  | "REMINDER_1H"
  | "STAFF_NEW_BOOKING"
  | "STAFF_BOOKING_RESCHEDULED"
  | "STAFF_BOOKING_CANCELLED";

export type Channel = "EMAIL" | "PUSH" | "IN_APP";

export type RecipientPrefs = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  reminder24h: boolean;
  reminder1h: boolean;
  marketingEmails: boolean;
};

export type Recipient = {
  /** `user:{id}` or `customer:{id}`; stable across channels. */
  key: string;
  kind: "customer" | "staff";
  name: string;
  email: string | null;
  locale: AppLocale;
  userId: string | null;
  /** `null` for guests (no account) → email on, reminders on. */
  prefs: RecipientPrefs | null;
  /** Active (non-failed) push subscriptions; 0 for guests. */
  pushSubscriptions: number;
};

export type PlanSettings = {
  emailNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  notifyAdminsOnNewBooking: boolean;
  notifyEmployeeOnNewBooking: boolean;
  reminder24hEnabled: boolean;
  reminder1hEnabled: boolean;
};

export type PlanModel = {
  settings: PlanSettings;
  customer: Recipient;
  /** OWNER / ADMIN members with an active account. */
  admins: Recipient[];
  /** Assigned employee, when they have an email or an account. */
  employee: Recipient | null;
  /** Employee before a reschedule moved the booking (if different). */
  previousEmployee?: Recipient | null;
};

export type Trigger =
  | { kind: "booking.created"; status: "PENDING" | "CONFIRMED" }
  | { kind: "booking.confirmed" }
  | { kind: "booking.rescheduled" }
  | { kind: "booking.cancelled"; byStaff: boolean }
  | { kind: "reminder"; reminderKind: "H24" | "H1" };

export type PlanItem = {
  type: NotificationType;
  channel: Channel;
  recipient: Recipient;
  /** Set when the item must be recorded as SKIPPED instead of sent. */
  skipReason: string | null;
};

export type PlanOptions = {
  /** The user who performed the action; excluded from staff notices. */
  actorUserId?: string | null;
};

function customerType(trigger: Trigger): NotificationType | null {
  switch (trigger.kind) {
    case "booking.created":
      return trigger.status === "CONFIRMED" ? "BOOKING_CONFIRMED" : "BOOKING_PENDING";
    case "booking.confirmed":
      return "BOOKING_CONFIRMED";
    case "booking.rescheduled":
      return "BOOKING_RESCHEDULED";
    case "booking.cancelled":
      return "BOOKING_CANCELLED";
    case "reminder":
      return trigger.reminderKind === "H24" ? "REMINDER_24H" : "REMINDER_1H";
  }
}

function staffType(trigger: Trigger): NotificationType | null {
  switch (trigger.kind) {
    case "booking.created":
      return "STAFF_NEW_BOOKING";
    case "booking.rescheduled":
      return "STAFF_BOOKING_RESCHEDULED";
    case "booking.cancelled":
      return "STAFF_BOOKING_CANCELLED";
    default:
      return null;
  }
}

function emailSkipReason(
  recipient: Recipient,
  settings: PlanSettings,
  trigger: Trigger,
  transactional: boolean,
): string | null {
  if (!settings.emailNotificationsEnabled) return "salon.emailDisabled";
  if (!recipient.email) return "recipient.noEmail";
  if (trigger.kind === "reminder") {
    if (trigger.reminderKind === "H24" && !settings.reminder24hEnabled)
      return "salon.reminder24hDisabled";
    if (trigger.reminderKind === "H1" && !settings.reminder1hEnabled)
      return "salon.reminder1hDisabled";
    if (recipient.prefs) {
      if (!recipient.prefs.emailEnabled) return "recipient.emailDisabled";
      if (trigger.reminderKind === "H24" && !recipient.prefs.reminder24h)
        return "recipient.reminder24hDisabled";
      if (trigger.reminderKind === "H1" && !recipient.prefs.reminder1h)
        return "recipient.reminder1hDisabled";
    }
    return null;
  }
  // Transactional emails about the recipient's own booking always go out;
  // staff-side notices respect the personal switch.
  if (!transactional && recipient.prefs && !recipient.prefs.emailEnabled) {
    return "recipient.emailDisabled";
  }
  return null;
}

function pushSkipReason(
  recipient: Recipient,
  settings: PlanSettings,
  trigger: Trigger,
): string | null {
  if (!settings.pushNotificationsEnabled) return "salon.pushDisabled";
  if (!recipient.prefs?.pushEnabled) return "recipient.pushDisabled";
  if (recipient.pushSubscriptions === 0) return "recipient.noSubscription";
  if (trigger.kind === "reminder") {
    if (trigger.reminderKind === "H24" && !settings.reminder24hEnabled)
      return "salon.reminder24hDisabled";
    if (trigger.reminderKind === "H1" && !settings.reminder1hEnabled)
      return "salon.reminder1hDisabled";
    if (trigger.reminderKind === "H24" && !recipient.prefs.reminder24h)
      return "recipient.reminder24hDisabled";
    if (trigger.reminderKind === "H1" && !recipient.prefs.reminder1h)
      return "recipient.reminder1hDisabled";
  }
  return null;
}

export function buildPlan(
  trigger: Trigger,
  model: PlanModel,
  options: PlanOptions = {},
): PlanItem[] {
  const items: PlanItem[] = [];
  const { settings } = model;

  const cType = customerType(trigger);
  if (cType) {
    items.push({
      type: cType,
      channel: "EMAIL",
      recipient: model.customer,
      skipReason: emailSkipReason(model.customer, settings, trigger, true),
    });
    if (model.customer.userId) {
      items.push({
        type: cType,
        channel: "PUSH",
        recipient: model.customer,
        skipReason: pushSkipReason(model.customer, settings, trigger),
      });
      if (trigger.kind !== "reminder") {
        items.push({ type: cType, channel: "IN_APP", recipient: model.customer, skipReason: null });
      }
    }
  }

  const sType = staffType(trigger);
  if (sType) {
    const staff = new Map<string, Recipient>();
    const add = (r: Recipient | null | undefined) => {
      if (!r) return;
      if (options.actorUserId && r.userId === options.actorUserId) return;
      if (!staff.has(r.key)) staff.set(r.key, r);
    };
    const notifyAdmins = trigger.kind !== "booking.created" || settings.notifyAdminsOnNewBooking;
    const notifyEmployee =
      trigger.kind !== "booking.created" || settings.notifyEmployeeOnNewBooking;
    if (notifyAdmins) model.admins.forEach(add);
    if (notifyEmployee) {
      add(model.employee);
      if (trigger.kind === "booking.rescheduled") add(model.previousEmployee);
    }
    for (const recipient of staff.values()) {
      items.push({
        type: sType,
        channel: "EMAIL",
        recipient,
        skipReason: emailSkipReason(recipient, settings, trigger, false),
      });
      if (recipient.userId) {
        items.push({
          type: sType,
          channel: "PUSH",
          recipient,
          skipReason: pushSkipReason(recipient, settings, trigger),
        });
        items.push({ type: sType, channel: "IN_APP", recipient, skipReason: null });
      }
    }
  }

  return items;
}

/** Idempotency key: one row per booking × type × channel × recipient × version (× reminder). */
export function dedupeKeyFor(input: {
  bookingId: string;
  type: NotificationType;
  channel: Channel;
  recipientKey: string;
  version: number;
  reminderId?: string | null;
}): string {
  const parts = [input.bookingId, input.type, input.channel, input.recipientKey, input.version];
  if (input.reminderId) parts.push(input.reminderId);
  return parts.join(":");
}
