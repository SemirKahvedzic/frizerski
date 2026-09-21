# Notifications

Email and web push notifications, reminders, preferences and the background job architecture that delivers them independently of anyone having the app open.

Related: [architecture.md §10](./architecture.md#10-background-jobs), [database.md §4.6](./database.md#46-notifications-and-events), [booking-system.md §6](./booking-system.md#6-booking-transaction).

---

## 1. Flow

```
booking.service (web)                      worker
──────────────────────                     ─────────────────────────────────────────────────────
BEGIN
  INSERT Booking
  INSERT BookingReminder ×2 (SCHEDULED)
  INSERT OutboxEvent('booking.created') ──▶ outbox relay (every 2 s, SKIP LOCKED)
COMMIT                                       └─▶ pg-boss job  notification.dispatch { event }
                                                   └─▶ NotificationDispatcher
                                                         resolve recipients
                                                         apply salon settings + user preferences
                                                         render templates (locale)
                                                         INSERT Notification rows (dedupeKey unique)
                                                         └─▶ jobs notification.sendEmail / notification.sendPush
                                                                 └─▶ EmailProvider / PushProvider
                                                                     UPDATE Notification status
                                             pg-boss delayed job reminder.send { reminderId }  (scheduledFor)
                                             cron reminder.sweep (* * * * *) re-enqueues due SCHEDULED rows
```

Everything to the right of the outbox is idempotent and retry-safe.

---

## 2. Domain events

| Event                   | Emitted by               | Payload                                                                                       |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `booking.created`       | createBooking            | `bookingId, version, salonId, employeeId, customerId, status`                                 |
| `booking.confirmed`     | status PENDING→CONFIRMED | `bookingId, version`                                                                          |
| `booking.rescheduled`   | rescheduleBooking        | `bookingId, version, previousStartsAt, newStartsAt, previousEmployeeId, newEmployeeId, actor` |
| `booking.cancelled`     | cancelBooking            | `bookingId, version, cancelledBy, reason`                                                     |
| `booking.statusChanged` | changeStatus             | `bookingId, version, from, to`                                                                |
| `membership.invited`    | invite                   | `membershipId, email` (email only)                                                            |
| `image.uploaded`        | media                    | `imageId` (optional async processing)                                                         |

Events are stored in `OutboxEvent` and published to pg-boss by the relay. Handlers receive the event and **re-read the current state** from the database; the payload is a hint, never the source of truth.

---

## 3. Notification matrix

| Trigger                            | Type                        | Recipients                                                                                             | Email | Push | In-app |
| ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ----- | ---- | ------ |
| Booking created (auto-confirm on)  | `BOOKING_CONFIRMED`         | customer                                                                                               | ✓     | ✓    | ✓      |
| Booking created (auto-confirm off) | `BOOKING_PENDING`           | customer                                                                                               | ✓     | ✓    | ✓      |
| Booking created                    | `STAFF_NEW_BOOKING`         | salon OWNER/ADMIN (if `notifyAdminsOnNewBooking`), assigned employee (if `notifyEmployeeOnNewBooking`) | ✓     | ✓    | ✓      |
| Booking confirmed by salon         | `BOOKING_CONFIRMED`         | customer                                                                                               | ✓     | ✓    | ✓      |
| Rescheduled                        | `BOOKING_RESCHEDULED`       | customer                                                                                               | ✓     | ✓    | ✓      |
| Rescheduled                        | `STAFF_BOOKING_RESCHEDULED` | admins, old and new employee                                                                           | ✓     | ✓    | ✓      |
| Cancelled                          | `BOOKING_CANCELLED`         | customer                                                                                               | ✓     | ✓    | ✓      |
| Cancelled                          | `STAFF_BOOKING_CANCELLED`   | admins, employee                                                                                       | ✓     | ✓    | ✓      |
| 24 h before                        | `REMINDER_24H`              | customer                                                                                               | ✓     | ✓    |        |
| 1 h before                         | `REMINDER_1H`               | customer                                                                                               | ✓     | ✓    |        |

A recipient who performed the action (e.g. the admin who cancelled) is excluded from the staff notification for that action.

### Preference resolution

A notification is sent on a channel only if **all** of the following are true:

1. Salon master switch: `SalonSettings.emailNotificationsEnabled` / `pushNotificationsEnabled`.
2. Salon type switch where one exists (`notifyAdminsOnNewBooking`, `notifyEmployeeOnNewBooking`, `reminder24hEnabled`, `reminder1hEnabled`).
3. Recipient preference (`NotificationPreference`): `emailEnabled` / `pushEnabled`, and for reminders `reminder24h` / `reminder1h`. Guests have no preference row → email on, push not applicable.
4. Channel viability: email requires a verified-format address; push requires at least one non-failed `PushSubscription`.

Transactional emails about the recipient's **own** booking (confirmation, cancellation by salon) are always sent regardless of `emailEnabled`, because the client must know their appointment state. `emailEnabled = false` only suppresses reminders and staff-side notices. This is documented in the UI.

Decisions that suppress a send still create a `Notification` row with `status = SKIPPED` and the reason in `error`, so the admin log explains why nothing was sent.

---

## 4. Dispatcher

```ts
class NotificationDispatcher {
  async handle(event: DomainEvent): Promise<void> {
    const booking = await repo.loadBookingForNotification(event.bookingId); // salon, settings, service, employee, customer(+user), admins
    if (!booking) return; // deleted salon etc.
    if (booking.version !== event.version && !isStaffEvent(event)) return; // superseded by a newer change; the newer event will notify
    const plan = buildPlan(event, booking); // [{ type, channel, recipient, locale }]
    for (const item of plan) {
      const dedupeKey = `${booking.id}:${item.type}:${item.channel}:${item.recipientKey}:${booking.version}`;
      const created = await repo.createNotificationIfAbsent({
        ...item,
        dedupeKey,
        payload: render(item, booking),
      });
      if (created)
        await queue.send(`notification.send${item.channel}`, { notificationId: created.id });
    }
  }
}
```

- `recipientKey` = `user:{id}` or `customer:{id}` or `push:{subscriptionId}`.
- `render()` uses react-email templates with `next-intl` messages for the recipient locale (`user.locale ?? customer locale from booking ?? salon.defaultLocale`).
- Send handlers load the `Notification` row, skip if `status != QUEUED`, call the provider, then set `SENT`/`FAILED` with provider message id or error. pg-boss retries `FAILED` sends up to 5 times with exponential backoff; the final failure stays visible in the admin log with a **Resend** action.

---

## 5. Reminders

### Scheduling

In the booking transaction, for each enabled kind:

```
scheduledFor = startsAt − 24h (H24) / − 1h (H1)
if scheduledFor > now + 1 min:
  INSERT BookingReminder { bookingId, kind, scheduledFor, status: SCHEDULED }
```

After commit the relay publishes `booking.created`; the dispatcher (or a dedicated `reminder.schedule` handler) creates one **delayed pg-boss job** per reminder: `queue.schedule('reminder.send', { reminderId }, scheduledFor, singletonKey = 'reminder:' + reminderId)` and stores `jobId` on the row.

### Sending (idempotent)

```sql
-- claim
UPDATE booking_reminders
   SET status = 'SENT', sent_at = now()
 WHERE id = $1 AND status = 'SCHEDULED'
RETURNING *;
```

Only the claimant proceeds. Then it re-checks the booking: status ∈ {PENDING, CONFIRMED} and `booking.startsAt − offset == reminder.scheduledFor` (tolerance 1 min). If the check fails the row is set to `SKIPPED` with a reason (the reminder was for an old time). Otherwise it dispatches `REMINDER_24H` / `REMINDER_1H` notifications through the same dispatcher path (dedupe keys include the reminder id).

### Invalidation

| Change                       | Effect on reminders                                                                                                                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reschedule                   | In the same transaction: all `SCHEDULED` reminders → `CANCELLED`; new `SCHEDULED` rows for the new time. After commit, the handler cancels old pg-boss jobs by `jobId` (best effort) and schedules new ones. Even if cancellation fails, the old job finds the row `CANCELLED` and exits. |
| Cancel                       | All `SCHEDULED` reminders → `CANCELLED`.                                                                                                                                                                                                                                                  |
| Status → COMPLETED / NO_SHOW | Remaining reminders → `CANCELLED`.                                                                                                                                                                                                                                                        |
| Salon disables reminders     | Future sends check `SalonSettings` at send time and `SKIP`.                                                                                                                                                                                                                               |

### Safety sweep

Cron `reminder.sweep` every minute: `SELECT id FROM booking_reminders WHERE status = 'SCHEDULED' AND scheduled_for <= now() + interval '2 minutes' AND (job_id IS NULL OR scheduled_for < now() - interval '5 minutes')` → enqueue `reminder.send` with the same singleton key. Covers lost jobs after a worker crash. The claim `UPDATE` guarantees a reminder is still sent at most once.

### Booking made inside the reminder window

A booking created 30 minutes before start gets no H1/H24 reminder rows (they would be in the past); the confirmation itself is the reminder.

---

## 6. Email

### Provider abstraction

```ts
interface EmailProvider {
  send(msg: {
    to: string;
    from: string;
    replyTo?: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
    tags?: Record<string, string>;
  }): Promise<{ providerMessageId: string }>;
}
```

| `EMAIL_PROVIDER` | Adapter                                          | Use                                         |
| ---------------- | ------------------------------------------------ | ------------------------------------------- |
| `resend`         | `ResendEmailProvider` (`RESEND_API_KEY`)         | production                                  |
| `smtp`           | `SmtpEmailProvider` (nodemailer; Mailpit in dev) | development, E2E assertions via Mailpit API |
| `fake`           | `FakeEmailProvider` (in-memory array)            | unit/integration tests                      |

Adding SendGrid or SES is one file implementing the interface. Sender identity: `EMAIL_FROM` (platform domain, e.g. `Studio Example via Bookly <no-reply@…>`) with `replyTo = salon.email`.

### Templates (react-email, localized bs/en)

Each template receives a typed `BookingEmailModel` and renders both HTML and plain text.

| Template                       | Subject (en)                                               |
| ------------------------------ | ---------------------------------------------------------- |
| `booking-confirmed`            | "Your appointment at {salon} is confirmed – {date} {time}" |
| `booking-pending`              | "We received your booking request – {salon}"               |
| `booking-rescheduled`          | "Your appointment was moved to {date} {time}"              |
| `booking-cancelled`            | "Your appointment at {salon} was cancelled"                |
| `reminder-24h`                 | "Reminder: tomorrow at {time} – {salon}"                   |
| `reminder-1h`                  | "See you in an hour – {salon}"                             |
| `staff-new-booking`            | "New booking: {service} with {employee}, {date} {time}"    |
| `staff-booking-cancelled`      | "Cancelled: {customer}, {date} {time}"                     |
| `staff-booking-rescheduled`    | "Moved: {customer} → {date} {time}"                        |
| `membership-invite`            | "You were invited to manage {salon}"                       |
| auth templates (verify, reset) | via Better Auth hooks, same provider                       |

Every booking template contains: salon name + logo + address + phone, client name, employee name, service name, date, start time and end time in salon timezone (timezone label shown), duration, price with currency, booking ID (short human code derived from the UUID, e.g. `#7K3M-2Q`), manage link (dashboard for users, token link for guests), cancellation policy sentence ("Free cancellation until …"), an `.ics` attachment for confirmations/reschedules.

---

## 7. Web push

### Provider abstraction

```ts
interface PushProvider {
  send(
    sub: PushSubscriptionRecord,
    msg: { title: string; body: string; url: string; tag: string; data?: object },
  ): Promise<{ ok: true } | { ok: false; gone: boolean; error: string }>;
}
```

| `PUSH_PROVIDER`      | Adapter                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `webpush`            | `WebPushProvider` (`web-push`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) |
| `fake`               | in-memory                                                                                |
| future `fcm`, `apns` | for native apps; selected by `PushSubscription.platform`                                 |

`gone = true` (HTTP 404/410 from the push service) marks `PushSubscription.failedAt` and the maintenance job removes it after 7 days.

### Client side

- `public/sw.js` handles `push` (show notification with `tag` so an updated booking replaces the previous notification) and `notificationclick` (focus/open `url`).
- Permission prompt is shown only after a meaningful action (after a booking is confirmed, or from notification settings), never on page load.
- `POST /me/push-subscriptions` stores the subscription; `NotificationPreference.pushEnabled` flips to true on first subscription.
- Staff receive push for `STAFF_*` types on all their devices.

### Payload

```json
{
  "title": "Appointment confirmed",
  "body": "Haircut with Marko · Sat 10 Oct, 11:00",
  "url": "/account/bookings/…",
  "tag": "booking:<id>",
  "data": { "bookingId": "…", "type": "BOOKING_CONFIRMED" }
}
```

---

## 8. In-app notifications

`IN_APP` rows are created for users (not guests) alongside email/push and power the bell icon in the client and admin shells (`GET /me/notifications`, mark-as-read). This costs nothing extra because the dispatcher already computes the plan.

---

## 9. Worker

`src/worker/index.ts`:

1. Validate env, connect Prisma, start pg-boss (`schema: 'pgboss'`, `retryLimit`, `retryBackoff`, `archiveCompletedAfterSeconds: 86400`, `deleteAfterDays: 7`).
2. Register handlers: `notification.dispatch`, `notification.sendEmail`, `notification.sendPush`, `reminder.send`, `reminder.sweep` (cron), `image.process`, `image.delete`, `maintenance.daily` (purge expired tokens, failed push subs, old rate-limit rows, outbox rows published > 7 days).
3. Start the outbox relay loop (2 s interval, batch 100, `FOR UPDATE SKIP LOCKED`, mark `PUBLISHED` or increment `attempts` and mark `FAILED` after 10).
4. Expose `GET /health` (DB ping, pg-boss started, outbox lag < 60 s).
5. Graceful shutdown on SIGTERM: stop fetching, finish in-flight jobs (30 s), disconnect.

Concurrency defaults: `notification.*` 10, `reminder.send` 10, `image.*` 2. Multiple worker replicas are safe.

---

## 10. Monitoring and admin visibility

- Salon admin → Notifications page: log of `Notification` rows with status, recipient, type, time, error, **Resend**.
- Platform → Jobs page: pg-boss queue sizes, failed jobs with retry, outbox lag, reminder rows due in the past still `SCHEDULED` (should be zero).
- Metrics logged as structured events (`notification.sent`, `notification.failed`, `reminder.skipped`) for the log platform.
