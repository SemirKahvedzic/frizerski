import { randomBytes } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hashToken } from "@/modules/booking/booking.service";
import type { BookingNotificationModel } from "@/modules/notifications/model";
import { dedupeKeyFor, type PlanItem, type Recipient } from "@/modules/notifications/plan";
import { JOBS, type JobQueue } from "@/modules/notifications/queue";
import {
  renderBookingEmail,
  type RenderContext,
} from "@/modules/notifications/render/booking-email";
import { renderPushMessage } from "@/modules/notifications/render/push";

export type DispatchDeps = { queue: JobQueue; now?: () => Date };

export type DispatchResult = { created: number; skipped: number; deduplicated: number };

export const MAX_SEND_ATTEMPTS = 5;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
  );
}

/**
 * Builds the URL a recipient uses to open the booking. Guests get a fresh
 * manage token (hashed at rest); users go to their dashboard; staff to admin.
 */
async function manageUrlFor(
  tx: Prisma.TransactionClient,
  model: BookingNotificationModel,
  recipient: Recipient,
  locale: string,
): Promise<string> {
  const base = `${env.APP_URL}/${locale}`;
  if (recipient.kind === "staff") {
    return `${base}/admin/${model.salon.slug}/calendar?view=day&date=${model.booking.startsAt.toISOString().slice(0, 10)}`;
  }
  if (recipient.userId) return `${base}/account/bookings`;
  const token = randomBytes(32).toString("base64url");
  await tx.bookingAccessToken.create({
    data: {
      salonId: model.salon.id,
      bookingId: model.booking.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(model.booking.endsAt.getTime() + 7 * 86_400_000),
    },
  });
  return `${base}/b/${token}`;
}

export type PersistOptions = {
  version: number;
  reminderId?: string | null;
  render: RenderContext;
  superseded: boolean;
};

/**
 * Turns plan items into `Notification` rows exactly once per dedupe key.
 * Email rows are QUEUED and handed to the queue; in-app rows are SENT
 * immediately (they are just inbox entries).
 */
export async function persistPlan(
  model: BookingNotificationModel,
  items: PlanItem[],
  deps: DispatchDeps,
  options: PersistOptions,
): Promise<DispatchResult> {
  const result: DispatchResult = { created: 0, skipped: 0, deduplicated: 0 };
  const now = deps.now?.() ?? new Date();

  for (const item of items) {
    const dedupeKey = dedupeKeyFor({
      bookingId: model.booking.id,
      type: item.type,
      channel: item.channel,
      recipientKey: item.recipient.key,
      version: options.version,
      reminderId: options.reminderId,
    });
    const skipReason =
      item.skipReason ??
      (options.superseded && item.recipient.kind === "customer" ? "superseded" : null);

    try {
      const created = await prisma.$transaction(async (tx) => {
        const common = {
          salonId: model.salon.id,
          bookingId: model.booking.id,
          userId: item.recipient.userId,
          customerId: item.recipient.kind === "customer" ? model.customerRecord.id : null,
          channel: item.channel,
          type: item.type,
          locale: item.recipient.locale,
          dedupeKey,
        } as const;

        if (skipReason) {
          return tx.notification.create({
            data: {
              ...common,
              status: "SKIPPED",
              recipient: item.recipient.email ?? item.recipient.key,
              payload: {},
              error: skipReason,
            },
            select: { id: true, status: true, channel: true },
          });
        }

        if (item.channel === "IN_APP") {
          const t = await renderBookingEmail(item.type, model, item.recipient, {
            ...options.render,
            manageUrl: await manageUrlFor(tx, model, item.recipient, item.recipient.locale),
            now,
          });
          return tx.notification.create({
            data: {
              ...common,
              status: "SENT",
              sentAt: now,
              recipient: item.recipient.key,
              subject: t.subject,
              payload: { title: t.subject, url: options.render.manageUrl || null },
            },
            select: { id: true, status: true, channel: true },
          });
        }

        if (item.channel === "PUSH") {
          const url = await manageUrlFor(tx, model, item.recipient, item.recipient.locale);
          const push = await renderPushMessage(item.type, model, item.recipient, url);
          return tx.notification.create({
            data: {
              ...common,
              status: "QUEUED",
              recipient: item.recipient.key,
              subject: push.title,
              payload: push as unknown as Prisma.InputJsonValue,
            },
            select: { id: true, status: true, channel: true },
          });
        }

        const manageUrl = await manageUrlFor(tx, model, item.recipient, item.recipient.locale);
        const rendered = await renderBookingEmail(item.type, model, item.recipient, {
          ...options.render,
          manageUrl,
          now,
        });
        return tx.notification.create({
          data: {
            ...common,
            status: "QUEUED",
            recipient: item.recipient.email!,
            subject: rendered.subject,
            payload: {
              to: item.recipient.email,
              subject: rendered.subject,
              html: rendered.html,
              text: rendered.text,
              replyTo: model.salon.email ?? undefined,
              attachments: rendered.ics
                ? [
                    {
                      filename: "appointment.ics",
                      content: rendered.ics,
                      contentType: "text/calendar; method=REQUEST",
                    },
                  ]
                : undefined,
            } as Prisma.InputJsonValue,
          },
          select: { id: true, status: true, channel: true },
        });
      });

      if (created.status === "SKIPPED") result.skipped += 1;
      else result.created += 1;
      if (created.status === "QUEUED" && created.channel === "EMAIL") {
        await deps.queue.send(JOBS.sendEmail, { notificationId: created.id });
      }
      if (created.status === "QUEUED" && created.channel === "PUSH") {
        await deps.queue.send(JOBS.sendPush, { notificationId: created.id });
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        result.deduplicated += 1;
        continue;
      }
      throw error;
    }
  }
  return result;
}
