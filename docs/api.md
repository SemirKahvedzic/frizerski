# API

Base path: `/api/v1`. JSON only. The REST API is the canonical contract (used by the web app for client-side fetches and by a future mobile app). The web UI's mutations also go through Server Actions that call the same module services with the same authorization; both are thin adapters.

Related: [architecture.md §5](./architecture.md#5-request-lifecycle), [booking-system.md](./booking-system.md).

---

## 1. Conventions

### Envelope

```jsonc
// success
{ "data": { ... }, "meta": { "nextCursor": "…", "total": 123 } }

// error
{ "error": { "code": "SLOT_UNAVAILABLE", "message": "This time is no longer available.", "details": { ... }, "requestId": "req_…" } }
```

`message` is localized using the `Accept-Language` header or the `?locale=` query; the UI prefers translating by `code`.

### Error codes

| HTTP | code                     | When                                                                    |
| ---- | ------------------------ | ----------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`       | Zod failure; `details.issues[]`                                         |
| 401  | `UNAUTHENTICATED`        | no/invalid session                                                      |
| 403  | `FORBIDDEN`              | authenticated, no permission                                            |
| 404  | `NOT_FOUND`              | missing, or belongs to another tenant                                   |
| 409  | `CONFLICT`               | stale `version`, duplicate slug, etc.                                   |
| 409  | `SLOT_UNAVAILABLE`       | requested time not bookable                                             |
| 422  | `POLICY_VIOLATION`       | cancellation cutoff, notice, horizon, inactive entity; `details.reason` |
| 422  | `INVALID_TRANSITION`     | disallowed status change                                                |
| 413  | `PAYLOAD_TOO_LARGE`      | uploads                                                                 |
| 415  | `UNSUPPORTED_MEDIA_TYPE` | uploads                                                                 |
| 429  | `RATE_LIMITED`           | `Retry-After` header set                                                |
| 500  | `INTERNAL_ERROR`         | unexpected; details only in server logs                                 |

### Pagination

Cursor-based: `?limit=50&cursor=<opaque>`. Response `meta.nextCursor` is `null` on the last page. Default limit 25, max 100. Lists are stable-sorted by `(sortColumn, id)`.

### Dates and money

Instants are ISO 8601 UTC (`2026-10-10T11:00:00.000Z`). Local dates are `YYYY-MM-DD`. Responses that show a time also include `timezone` at the resource level. Money is `{ "amountCents": 2000, "currency": "BAM" }`.

### Authentication

- Session cookie set by Better Auth (`/api/auth/*`). Mobile clients use Better Auth's bearer plugin (`Authorization: Bearer <session token>`).
- Guest booking management uses a capability token in the path (`/bookings/manage/:token`) and needs no session.
- Every mutating request must carry `Origin` matching `APP_URL` (CSRF) unless authenticated by bearer token.

### Idempotency

`POST /salons/:slug/bookings` and `POST /salons/:salonId/bookings` accept an optional `Idempotency-Key` header (UUID). The same key within 24 h returns the original response instead of creating a second booking (stored in the `IdempotencyKey` table, see [database.md](./database.md#idempotencykey)).

### Rate limits (per IP unless noted)

| Route group                                    | Limit                |
| ---------------------------------------------- | -------------------- |
| `/api/auth/*` sign-in, sign-up, password reset | 10 / min             |
| `POST …/bookings` (public)                     | 20 / min             |
| `GET …/availability*`                          | 120 / min            |
| `/bookings/manage/:token`                      | 30 / min             |
| Authenticated admin routes                     | 600 / min per user   |
| Uploads                                        | 30 / 10 min per user |

### Versioning

Path-versioned (`/v1`). Additive changes are non-breaking; removals require `/v2`.

---

## 2. Authentication (`/api/auth/*`, Better Auth)

Implemented in Phase 2. Cookies are prefixed `salon.` (`salon.session_token`). Verification links point to `/api/auth/verify-email?token=…&callbackURL=/{locale}/account`; reset links to `/api/auth/reset-password/{token}?callbackURL=/{locale}/reset-password`, which redirects to the page with `?token=`. `GET /api/v1/me` (session required) returns the actor: id, email, name, `emailVerified`, `locale`, `platformRole`, `memberships[]`.

Implemented in Phase 4: `PATCH /api/v1/salons/:salonId` (profile), `GET/PATCH /api/v1/salons/:salonId/settings`, `GET/PUT /api/v1/salons/:salonId/working-hours`, `GET/POST /api/v1/salons/:salonId/closures`, `DELETE /api/v1/salons/:salonId/closures/:closureId`, and the public `GET /api/v1/public/salons/:slug` (ACTIVE salons only; lives under `/public` so slugs never collide with `/salons/:salonId`). Every mutation revalidates the `salon:{slug}` cache tag that the public page reads through.

Implemented in Phase 3: `POST /api/v1/salons` (create, caller becomes OWNER, 5/hour per user), `GET /api/v1/salons` (caller's salons with role), `GET /api/v1/salons/:salonId` (member or platform admin), `GET /api/v1/platform/salons` (cursor-paginated, `q`, `status`), `PATCH /api/v1/platform/salons/:salonId/status`, `GET /api/v1/platform/stats`. Web pages use the same services through Server Actions (`defineAuthedAction`).

Handled by Better Auth: `POST sign-up/email`, `POST sign-in/email`, `POST sign-out`, `GET session`, `POST forget-password`, `POST reset-password`, `GET verify-email`, `GET /sign-in/social?provider=google`. After sign-up we hook `onUserCreated` to create `NotificationPreference` and to link `Customer` rows with the same verified email.

---

## 3. Public endpoints (no session required)

| Method | Path                                 | Description                                                                                                                                                                                                                                                         |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/salons/:slug`                      | Salon public profile: name, description, images (logo, cover), address, contacts, socials, opening hours, closures (next 60 days), audience, timezone, currency, booking rules summary (`cancellationCutoffHours`, `allowGuestBooking`). 404 if `status != ACTIVE`. |
| GET    | `/salons/:slug/services`             | Active services grouped by category. `?audience=MALE\|FEMALE` filters. Includes price, duration, image, `employeeIds` who provide it.                                                                                                                               |
| GET    | `/salons/:slug/employees`            | Active, online-bookable employees: name, position, bio, avatar, audience, `serviceIds`.                                                                                                                                                                             |
| GET    | `/salons/:slug/gallery`              | Ordered gallery images with variants.                                                                                                                                                                                                                               |
| GET    | `/salons/:slug/availability`         | `?serviceId&employeeId=<id>\|any&date=YYYY-MM-DD` → slots (see booking-system §7).                                                                                                                                                                                  |
| GET    | `/salons/:slug/availability/summary` | `?serviceId&employeeId&month=YYYY-MM` → `{ days: { "2026-10-10": true, … } }`.                                                                                                                                                                                      |
| POST   | `/salons/:slug/bookings`             | Create booking as guest or as the signed-in user.                                                                                                                                                                                                                   |
| GET    | `/bookings/manage/:token`            | Guest: booking details + policy flags (`canCancel`, `canReschedule`, `cancelUntil`).                                                                                                                                                                                |
| POST   | `/bookings/manage/:token/reschedule` | Guest reschedule `{ startsAt, employeeId? }`.                                                                                                                                                                                                                       |
| POST   | `/bookings/manage/:token/cancel`     | Guest cancel `{ reason? }`.                                                                                                                                                                                                                                         |

**POST `/salons/:slug/bookings`**

```jsonc
// request
{
  "serviceId": "…",
  "employeeId": "…" | "any",
  "startsAt": "2026-10-10T09:00:00.000Z",
  "customer": { "firstName": "Amina", "lastName": "H.", "email": "amina@example.com", "phone": "+38761123456" }, // omitted when signed in
  "notes": "…",
  "locale": "bs"
}
// response 201
{ "data": { "id": "…", "status": "CONFIRMED", "startsAt": "…", "endsAt": "…", "timezone": "Europe/Sarajevo",
            "service": { "id", "name", "durationMinutes", "price": { "amountCents": 2000, "currency": "BAM" } },
            "employee": { "id", "firstName", "lastName", "avatar": {...} },
            "salon": { "slug", "name", "address" },
            "policy": { "canCancel": true, "cancelUntil": "…", "canReschedule": true },
            "manageUrl": "https://…/b/<token>" } }   // guests only
```

---

## 4. Client endpoints (`/me`, session required)

| Method    | Path                                       | Description                                                                                                                                        |
| --------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET       | `/me`                                      | Profile (first/last name, phone, locale, `emailVerified`), `platformRole`, `memberships[]`.                                                        |
| PATCH     | `/me`                                      | `{ firstName, lastName, phone, locale }`.                                                                                                          |
| GET       | `/me/bookings`                             | `?scope=upcoming\|past\|cancelled&cursor` across all salons; each item has salon, employee, service, times, duration, price, status, policy flags. |
| GET       | `/me/bookings/:id`                         | Details + status history.                                                                                                                          |
| POST      | `/me/bookings/:id/reschedule`              | `{ startsAt, employeeId?, version }`.                                                                                                              |
| POST      | `/me/bookings/:id/cancel`                  | `{ reason?, version }`.                                                                                                                            |
| GET / PUT | `/me/notification-preferences`             | `{ emailEnabled, pushEnabled, reminder24h, reminder1h, marketingEmails }`. Defaults are returned when the user has not saved yet.                  |
| GET       | `/me/notifications`                        | In-app notification feed (`IN_APP` channel rows).                                                                                                  |
| POST      | `/me/push-subscriptions`                   | `{ platform: "WEB", endpoint, keys: { p256dh, auth }, userAgent }`. Idempotent on endpoint.                                                        |
| DELETE    | `/me/push-subscriptions`                   | `{ endpoint }`.                                                                                                                                    |
| GET       | `/me/sessions` / DELETE `/me/sessions/:id` | Session management (via Better Auth).                                                                                                              |

---

## 5. Salon admin endpoints (`/salons/:salonId/*`, membership required)

`:salonId` is the salon id; the admin UI resolves slug → id once. Role requirements: OWNER/ADMIN unless noted. EMPLOYEE has read access to their own bookings and schedule only.

### Salon and settings

| Method         | Path                              | Body / notes                                                                                                                            |
| -------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| GET            | `/salons/:salonId`                | full salon incl. settings, working hours, closures                                                                                      |
| PATCH          | `/salons/:salonId`                | profile fields (name, description, category, audience, address…, socials, `logoImageId`, `coverImageId`, `brandColor`, `defaultLocale`) |
| PATCH          | `/salons/:salonId/settings`       | any `SalonSettings` field incl. `timezone` and `currency` (moved here for clarity; stored on Salon)                                     |
| PUT            | `/salons/:salonId/working-hours`  | full 7-day array `[{ weekday, opensAt, closesAt, isClosed }]`                                                                           |
| GET / POST     | `/salons/:salonId/closures`       | `{ startsOn, endsOn, reason }`                                                                                                          |
| DELETE         | `/salons/:salonId/closures/:id`   |                                                                                                                                         |
| GET            | `/salons/:salonId/members`        | memberships with user summary                                                                                                           |
| POST           | `/salons/:salonId/members/invite` | `{ email, role, employeeId? }` (OWNER for ADMIN role)                                                                                   |
| PATCH / DELETE | `/salons/:salonId/members/:id`    | change role / remove (OWNER for admins)                                                                                                 |

### Employees

| Method               | Path                                                 | Notes                                                                                                                                        |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                  | `/salons/:salonId/employees`                         | `?isActive&serviceId&workingDay=0-6`                                                                                                         |
| POST                 | `/salons/:salonId/employees`                         | profile fields                                                                                                                               |
| GET / PATCH / DELETE | `/salons/:salonId/employees/:id`                     | DELETE refused (422) if bookings exist → deactivate instead                                                                                  |
| PUT                  | `/salons/:salonId/employees/:id/schedule`            | `{ blocks: [{ weekday, startTime, endTime, breaks: [{ startTime, endTime, label }] }], validFrom? }` — replaces the current schedule version |
| GET                  | `/salons/:salonId/employees/:id/schedule`            | current + future versions                                                                                                                    |
| GET / POST           | `/salons/:salonId/employees/:id/time-off`            | `{ type, startsAt, endsAt, allDay, reason }` (allDay accepts local dates)                                                                    |
| PATCH / DELETE       | `/salons/:salonId/employees/:id/time-off/:timeOffId` |                                                                                                                                              |
| PUT                  | `/salons/:salonId/employees/:id/services`            | `[{ serviceId, priceOverrideCents?, durationOverrideMinutes? }]`                                                                             |
| GET / POST           | `/salons/:salonId/blocked-times`                     | `{ employeeId?, startsAt, endsAt, reason }`; `?from&to&employeeId`                                                                           |
| DELETE               | `/salons/:salonId/blocked-times/:id`                 |                                                                                                                                              |

Writes to schedules/time off/blocks that would orphan existing CONFIRMED bookings return `409 CONFLICT` with `details.conflictingBookings[]`; the UI offers to proceed with `force: true` (bookings stay, audited) or to reschedule them first.

### Services

| Method               | Path                                          | Notes                                                                                                                          |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET / POST           | `/salons/:salonId/service-categories`         |                                                                                                                                |
| PATCH / DELETE       | `/salons/:salonId/service-categories/:id`     | delete sets services' category to null                                                                                         |
| PUT                  | `/salons/:salonId/service-categories/reorder` | `{ ids: [] }`                                                                                                                  |
| GET                  | `/salons/:salonId/services`                   | `?categoryId&audience&isActive&q`                                                                                              |
| POST                 | `/salons/:salonId/services`                   | `{ name, description, priceCents, durationMinutes, bufferAfterMinutes, audience, categoryId, imageId, isActive, employeeIds }` |
| GET / PATCH / DELETE | `/salons/:salonId/services/:id`               | delete refused if future bookings reference it → deactivate                                                                    |
| PUT                  | `/salons/:salonId/services/reorder`           | `{ categoryId?, ids: [] }`                                                                                                     |

### Bookings and calendar

| Method | Path                                       | Notes                                                                                                                                                                                                                                          |
| ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/salons/:salonId/bookings`                | `?from&to&employeeId&serviceId&status[]&customerId&q&cursor` (`q` searches customer name/email/phone). EMPLOYEE role: forced `employeeId = own`.                                                                                               |
| GET    | `/salons/:salonId/calendar`                | `?from&to&employeeId[]` (max 31 days) → compact events + blocks + time off + closures for rendering. _Not yet exposed_: the web calendar is a server component composing the same data; the route is scheduled for Phase 14 (API completeness) |
| POST   | `/salons/:salonId/bookings`                | admin create: `{ serviceId, employeeId, startsAt, customerId                                                                                                                                                                                   | customer{…}, source: ADMIN | WALK_IN, internalNotes, overrideWorkingHours? }` |
| GET    | `/salons/:salonId/bookings/:id`            | full details incl. history, notifications, reminders                                                                                                                                                                                           |
| PATCH  | `/salons/:salonId/bookings/:id`            | `{ internalNotes, clientNotes, version }`                                                                                                                                                                                                      |
| POST   | `/salons/:salonId/bookings/:id/status`     | `{ status, reason?, version }` — EMPLOYEE only COMPLETED/NO_SHOW on own                                                                                                                                                                        |
| POST   | `/salons/:salonId/bookings/:id/reschedule` | `{ startsAt, employeeId?, version, notifyCustomer: true }`                                                                                                                                                                                     |
| POST   | `/salons/:salonId/bookings/:id/cancel`     | `{ reason?, version, notifyCustomer: true }`                                                                                                                                                                                                   |
| GET    | `/salons/:salonId/availability`            | same as public but by salonId and honoring admin overrides (`ignoreNotice=true`)                                                                                                                                                               |

### Customers

| Method      | Path                                      | Notes                                          |
| ----------- | ----------------------------------------- | ---------------------------------------------- |
| GET         | `/salons/:salonId/customers`              | `?q&cursor&sort=lastBookingAt                  | name`→ each with`stats { total, completed, cancelled, noShow, lastAppointmentAt, nextAppointmentAt }` |
| POST        | `/salons/:salonId/customers`              | manual customer                                |
| GET / PATCH | `/salons/:salonId/customers/:id`          | profile + notes                                |
| GET         | `/salons/:salonId/customers/:id/bookings` | history, cursor                                |
| POST        | `/salons/:salonId/customers/merge`        | `{ sourceId, targetId }` (duplicates), audited |

### Media and gallery

| Method         | Path                               | Notes                                                                     |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| POST           | `/salons/:salonId/images`          | multipart `file`, field `purpose`; ≤ 10 MB; returns `Image` with variants |
| DELETE         | `/salons/:salonId/images/:id`      | removes references and objects                                            |
| GET            | `/salons/:salonId/gallery`         |                                                                           |
| POST           | `/salons/:salonId/gallery`         | `{ imageId, caption? }` append                                            |
| PUT            | `/salons/:salonId/gallery/reorder` | `{ ids: [] }`                                                             |
| PATCH / DELETE | `/salons/:salonId/gallery/:id`     | caption / remove from gallery (image kept unless `deleteImage=true`)      |

### Analytics

| Method | Path                                      | Notes                                                                                                                                                  |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/salons/:salonId/analytics/overview`     | `?from&to` → today's appointments, upcoming count, revenue (COMPLETED priceCents sum) today/range, customers count, completed/cancelled/no-show counts |
| GET    | `/salons/:salonId/analytics/appointments` | `?from&to&granularity=day                                                                                                                              | week | month` → series by status |
| GET    | `/salons/:salonId/analytics/revenue`      | series                                                                                                                                                 |
| GET    | `/salons/:salonId/analytics/services`     | top services by count and revenue                                                                                                                      |
| GET    | `/salons/:salonId/analytics/employees`    | bookings and revenue per employee                                                                                                                      |

### Notifications and audit

| Method | Path                                        | Notes                                                 |
| ------ | ------------------------------------------- | ----------------------------------------------------- |
| GET    | `/salons/:salonId/notifications`            | sent notification log `?bookingId&type&status&cursor` |
| POST   | `/salons/:salonId/notifications/:id/resend` | re-queue a FAILED notification                        |
| GET    | `/salons/:salonId/audit-logs`               | `?entityType&entityId&actorUserId&from&to&cursor`     |

---

## 6. Platform endpoints (`/platform/*`, `SUPER_ADMIN`)

| Method      | Path                   | Notes                                                                      |
| ----------- | ---------------------- | -------------------------------------------------------------------------- |
| GET         | `/platform/stats`      | salons by status, users, bookings/day (30 d), job queue health, outbox lag |
| GET         | `/platform/salons`     | `?status&q&cursor`                                                         |
| POST        | `/platform/salons`     | create salon + owner invite                                                |
| GET / PATCH | `/platform/salons/:id` | edit any field; `status` → INACTIVE/SUSPENDED/ACTIVE                       |
| DELETE      | `/platform/salons/:id` | hard delete (requires `confirm: slug`), audited                            |
| GET         | `/platform/users`      | `?q&cursor`                                                                |
| PATCH       | `/platform/users/:id`  | `isActive`, `platformRole`                                                 |
| GET / PUT   | `/platform/settings`   | `PlatformSetting` key/values                                               |
| GET         | `/platform/jobs`       | pg-boss queue summary, failed jobs; `POST /platform/jobs/:id/retry`        |
| GET         | `/platform/audit-logs` | cross-tenant                                                               |

---

## 7. Operational

| Method | Path           | Notes                                                                  |
| ------ | -------------- | ---------------------------------------------------------------------- |
| GET    | `/api/health`  | `{ status: "ok", db: "ok", version, uptime }`; 503 when DB unreachable |
| GET    | `/api/v1/meta` | supported locales, currencies, timezones list (cached)                 |

---

## 8. Security

- Every handler is created with `defineRoute({ auth: 'session' | 'optional' | 'none', permission?, rateLimit, schema })`. A route without `auth` and `permission` configuration fails to compile.
- Tenant resolution happens in `defineRoute` from `:salonId` and the actor's memberships; handlers receive a `TenantContext` and never read `salonId` from the body.
- Cross-tenant ids return 404, not 403, so existence is not leaked.
- Request bodies limited to 1 MB (JSON) / 10 MB (multipart).
- `Origin` check for cookie-authenticated mutations; Better Auth's own CSRF protection on `/api/auth`.
- Response headers: `Cache-Control: no-store` for authenticated responses; public GETs get `s-maxage=60, stale-while-revalidate=300`.
- Error responses never include stack traces or SQL; `requestId` correlates with server logs.
- Uploads: magic-byte MIME sniffing, size limits, re-encoding, random object keys, no user-controlled paths.
- All admin mutations write `AuditLog` inside the same transaction.

---

## 9. Server Actions

The web UI uses Server Actions for form mutations (`defineAction`) with identical guarantees: session, tenant resolution, Zod, permission, error mapping to a `{ ok, data | error }` result the form renders. Actions call the same `modules/*/service.ts` functions as the REST handlers, so there is exactly one implementation of every use case.
