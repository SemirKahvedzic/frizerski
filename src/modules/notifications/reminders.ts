import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { persistPlan, type DispatchDeps } from "@/modules/notifications/persist";
import { buildPlan } from "@/modules/notifications/plan";
import { loadBookingNotificationModel } from "@/modules/notifications/model";
import { JOBS, type JobQueue } from "@/modules/notifications/queue";

const log = logger.child({ module: "reminders" });

const OFFSET_MS = { H24: 24 * 3_600_000, H1: 3_600_000 } as const;
const TOLERANCE_MS = 60_000;

/**
 * Creates one delayed job per SCHEDULED reminder that has none yet
 * (docs/notifications.md §5). Safe to call repeatedly.
 */
export async function scheduleReminderJobs(bookingId: string, queue: JobQueue): Promise<number> {
  const pending = await prisma.bookingReminder.findMany({
    where: { bookingId, status: "SCHEDULED", jobId: null },
    select: { id: true, scheduledFor: true },
  });
  let scheduled = 0;
  for (const reminder of pending) {
    const jobId = await queue.send(
      JOBS.reminderSend,
      { reminderId: reminder.id },
      { startAfter: reminder.scheduledFor, singletonKey: `reminder:${reminder.id}` },
    );
    await prisma.bookingReminder.update({
      where: { id: reminder.id },
      data: { jobId: jobId ?? `singleton:${reminder.id}` },
    });
    scheduled += 1;
  }
  return scheduled;
}

export type ReminderOutcome = "sent" | "skipped" | "not-claimed";

/**
 * Handler for `reminder.send`: claims the row (SCHEDULED → SENT, exactly one
 * winner), re-validates the booking and dispatches the reminder notifications.
 * A reminder that no longer matches the booking is marked SKIPPED.
 */
export async function sendDueReminder(
  reminderId: string,
  deps: DispatchDeps,
): Promise<ReminderOutcome> {
  const now = deps.now?.() ?? new Date();
  const claimed = await prisma.bookingReminder.updateMany({
    where: { id: reminderId, status: "SCHEDULED" },
    data: { status: "SENT", sentAt: now },
  });
  if (claimed.count === 0) return "not-claimed";

  const reminder = await prisma.bookingReminder.findUniqueOrThrow({ where: { id: reminderId } });
  const model = await loadBookingNotificationModel(reminder.bookingId);

  const skip = async (reason: string) => {
    await prisma.bookingReminder.update({ where: { id: reminderId }, data: { status: "SKIPPED" } });
    log.info({ reminderId, reason }, "reminder.skipped");
    return "skipped" as const;
  };

  if (!model) return skip("booking missing");
  if (model.booking.status !== "PENDING" && model.booking.status !== "CONFIRMED") {
    return skip(`booking ${model.booking.status}`);
  }
  const expected = model.booking.startsAt.getTime() - OFFSET_MS[reminder.kind];
  if (Math.abs(expected - reminder.scheduledFor.getTime()) > TOLERANCE_MS) {
    return skip("booking time changed");
  }
  const enabled =
    reminder.kind === "H24" ? model.settings.reminder24hEnabled : model.settings.reminder1hEnabled;
  if (!enabled) return skip("salon disabled reminders");

  await persistPlan(
    model,
    buildPlan({ kind: "reminder", reminderKind: reminder.kind }, model),
    deps,
    {
      version: model.booking.version,
      reminderId: reminder.id,
      render: { manageUrl: "" },
      superseded: false,
    },
  );
  return "sent";
}

/**
 * Cron safety net: enqueues reminders that are due (or overdue) and have no
 * job, e.g. after a worker crash. The singleton key prevents duplicates and
 * the claim in `sendDueReminder` guarantees at-most-once sending.
 */
export async function sweepReminders(queue: JobQueue, now = new Date()): Promise<number> {
  const due = await prisma.bookingReminder.findMany({
    where: {
      status: "SCHEDULED",
      scheduledFor: { lte: new Date(now.getTime() + 2 * 60_000) },
      OR: [{ jobId: null }, { scheduledFor: { lt: new Date(now.getTime() - 5 * 60_000) } }],
    },
    select: { id: true, scheduledFor: true },
    take: 200,
  });
  for (const reminder of due) {
    const jobId = await queue.send(
      JOBS.reminderSend,
      { reminderId: reminder.id },
      { startAfter: reminder.scheduledFor, singletonKey: `reminder:${reminder.id}` },
    );
    if (jobId) {
      await prisma.bookingReminder.update({ where: { id: reminder.id }, data: { jobId } });
    }
  }
  if (due.length > 0) log.info({ count: due.length }, "reminder.sweep");
  return due.length;
}
