import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getEmailProvider } from "@/modules/notifications/email";
import { parseBookingEvent, type DomainEvent } from "@/modules/notifications/events";
import {
  loadBookingNotificationModel,
  type BookingNotificationModel,
} from "@/modules/notifications/model";
import { buildPlan, type Trigger } from "@/modules/notifications/plan";
import {
  MAX_SEND_ATTEMPTS,
  persistPlan,
  type DispatchDeps,
  type DispatchResult,
} from "@/modules/notifications/persist";
import { scheduleReminderJobs } from "@/modules/notifications/reminders";

export {
  MAX_SEND_ATTEMPTS,
  type DispatchDeps,
  type DispatchResult,
} from "@/modules/notifications/persist";

const log = logger.child({ module: "notifications" });

function triggerFor(
  event: ReturnType<typeof parseBookingEvent> & object,
): { trigger: Trigger; previousEmployeeId: string | null } | null {
  switch (event.type) {
    case "booking.created":
      return {
        trigger: { kind: "booking.created", status: event.payload.status },
        previousEmployeeId: null,
      };
    case "booking.rescheduled":
      return {
        trigger: { kind: "booking.rescheduled" },
        previousEmployeeId: event.payload.previousEmployeeId,
      };
    case "booking.cancelled":
      return {
        trigger: { kind: "booking.cancelled", byStaff: event.payload.cancelledBy === "SALON" },
        previousEmployeeId: null,
      };
    case "booking.statusChanged":
      if (event.payload.from === "PENDING" && event.payload.to === "CONFIRMED") {
        return { trigger: { kind: "booking.confirmed" }, previousEmployeeId: null };
      }
      if (event.payload.to === "CANCELLED") {
        return {
          trigger: { kind: "booking.cancelled", byStaff: true },
          previousEmployeeId: null,
        };
      }
      return null; // COMPLETED / NO_SHOW: no notification
  }
}

/** Handler for `notification.dispatch` jobs (one outbox event). */
export async function dispatchBookingEvent(
  event: DomainEvent,
  deps: DispatchDeps,
): Promise<DispatchResult | null> {
  const parsed = parseBookingEvent(event);
  if (!parsed) {
    log.warn({ eventId: event.id, type: event.type }, "unknown or malformed outbox event");
    return null;
  }
  const mapped = triggerFor(parsed);
  if (!mapped) return null;

  const model = await loadBookingNotificationModel(parsed.payload.bookingId, {
    previousEmployeeId: mapped.previousEmployeeId,
  });
  if (!model) {
    log.warn({ bookingId: parsed.payload.bookingId }, "booking vanished before dispatch");
    return null;
  }

  const superseded = model.booking.version !== parsed.payload.version;
  const items = buildPlan(mapped.trigger, model, {
    actorUserId: parsed.payload.actorUserId ?? null,
  });
  const result = await persistPlan(model, items, deps, {
    version: parsed.payload.version,
    render: {
      manageUrl: "",
      previousStartsAt:
        parsed.type === "booking.rescheduled" ? new Date(parsed.payload.previousStartsAt) : null,
      reason: parsed.type === "booking.cancelled" ? (parsed.payload.reason ?? null) : null,
    },
    superseded,
  });

  if (parsed.type === "booking.created" || parsed.type === "booking.rescheduled") {
    await scheduleReminderJobs(model.booking.id, deps.queue);
  }

  log.info({ eventId: event.id, type: event.type, ...result }, "event dispatched");
  return result;
}

/** Used by the reminder handler once a reminder has been claimed. */
export async function dispatchReminder(
  model: BookingNotificationModel,
  reminder: { id: string; kind: "H24" | "H1" },
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const items = buildPlan({ kind: "reminder", reminderKind: reminder.kind }, model);
  return persistPlan(model, items, deps, {
    version: model.booking.version,
    reminderId: reminder.id,
    render: { manageUrl: "" },
    superseded: false,
  });
}

export type SendOutcome = "sent" | "skipped" | "failed";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
};

/**
 * Handler for `notification.sendEmail`. Idempotent: only QUEUED rows are
 * sent. Failures keep the row QUEUED (with the error) until the attempt cap,
 * then mark it FAILED; the error is re-thrown so the queue retries.
 */
export async function sendEmailNotification(notificationId: string): Promise<SendOutcome> {
  const row = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!row || row.channel !== "EMAIL" || row.status !== "QUEUED") return "skipped";
  const payload = row.payload as EmailPayload;
  const provider = getEmailProvider();
  try {
    const result = await provider.send({
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo,
      attachments: payload.attachments,
      tags: { type: row.type, notificationId: row.id },
    });
    await prisma.notification.update({
      where: { id: row.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        attempts: { increment: 1 },
        providerMessageId: result.providerMessageId,
        error: null,
      },
    });
    log.info(
      { notificationId: row.id, type: row.type, provider: provider.name },
      "notification.sent",
    );
    return "sent";
  } catch (error) {
    const attempts = row.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    await prisma.notification.update({
      where: { id: row.id },
      data: {
        attempts,
        error: message.slice(0, 1000),
        status: attempts >= MAX_SEND_ATTEMPTS ? "FAILED" : "QUEUED",
      },
    });
    log.error({ notificationId: row.id, attempts, err: error }, "notification.failed");
    if (attempts >= MAX_SEND_ATTEMPTS) return "failed";
    throw error;
  }
}
