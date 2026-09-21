export {
  ConsoleEmailProvider,
  FakeEmailProvider,
  SmtpEmailProvider,
  getEmailProvider,
  sendEmail,
  setEmailProvider,
  type EmailMessage,
  type EmailProvider,
} from "@/modules/notifications/email";
export { ResendEmailProvider } from "@/modules/notifications/email/providers/resend";
export {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/modules/notifications/email/templates/auth";
export { sendEmployeeInviteEmail } from "@/modules/notifications/email/templates/invite";

export {
  MAX_SEND_ATTEMPTS,
  dispatchBookingEvent,
  dispatchReminder,
  sendEmailNotification,
  type DispatchDeps,
  type DispatchResult,
} from "@/modules/notifications/dispatcher";
export {
  bookingEventPayloadSchemas,
  isBookingEventType,
  parseBookingEvent,
  type DomainEvent,
  type ParsedBookingEvent,
} from "@/modules/notifications/events";
export {
  listNotificationsForSalon,
  listNotificationsForUser,
  listNotificationsQuerySchema,
  markNotificationRead,
  resendNotification,
  type NotificationLogItem,
} from "@/modules/notifications/log";
export {
  loadBookingNotificationModel,
  type BookingNotificationModel,
} from "@/modules/notifications/model";
export { OUTBOX_MAX_ATTEMPTS, outboxLagSeconds, relayOutbox } from "@/modules/notifications/outbox";
export {
  buildPlan,
  dedupeKeyFor,
  type Channel,
  type NotificationType,
  type PlanItem,
  type PlanModel,
  type Recipient,
  type Trigger,
} from "@/modules/notifications/plan";
export {
  InMemoryQueue,
  JOBS,
  type JobName,
  type JobQueue,
  type SendJobOptions,
} from "@/modules/notifications/queue";
export {
  scheduleReminderJobs,
  sendDueReminder,
  sweepReminders,
  type ReminderOutcome,
} from "@/modules/notifications/reminders";
export { renderBookingEmail, shortBookingCode } from "@/modules/notifications/render/booking-email";
export { renderIcs } from "@/modules/notifications/render/ics";
export {
  DisabledPushProvider,
  FakePushProvider,
  WebPushProvider,
  getPushProvider,
  pushPublicConfig,
  setPushProvider,
} from "@/modules/notifications/push";
export type {
  PushMessage,
  PushProvider,
  PushSendResult,
  PushSubscriptionRecord,
} from "@/modules/notifications/push/types";
export {
  listPushSubscriptions,
  markPushSubscriptionGone,
  pushSubscriptionInputSchema,
  pushUnsubscribeSchema,
  removePushSubscription,
  upsertPushSubscription,
  type PushSubscriptionInput,
  type PushSubscriptionView,
} from "@/modules/notifications/push/subscriptions";
export { renderPushMessage } from "@/modules/notifications/render/push";
export { sendPushNotification, type PushOutcome } from "@/modules/notifications/send-push";
