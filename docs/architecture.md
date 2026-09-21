# Architecture

> Multi-tenant SaaS for hair salons: salon profiles, staff, schedules, services and prices, a conflict-free booking engine, admin calendar, client dashboard, email + web push notifications with reminders, image management, analytics, i18n, audit logging.

Related documents: [database.md](./database.md) · [api.md](./api.md) · [booking-system.md](./booking-system.md) · [notifications.md](./notifications.md) · [setup.md](./setup.md) · [testing.md](./testing.md)

---

## 1. Goals and design principles

Priorities, in order (from the product brief):

1. Correct booking logic
2. Security
3. Multi-tenant isolation
4. Reliability
5. Good UX
6. Performance
7. Maintainability
8. Scalability

Principles that follow from these priorities:

- **Business logic lives in framework-agnostic modules** (`src/modules/*`). Next.js pages, Route Handlers and Server Actions are thin adapters. The same module code is used by the web app, the background worker, tests, and later a mobile API.
- **The database is the last line of defense.** Tenant integrity and booking conflicts are enforced by constraints, not only by application code.
- **Explicit over implicit.** Tenant context, actor, and permissions are passed as values. No global "current salon".
- **Every external provider sits behind an interface** (email, push, storage, queue, error tracking, rate limiting). Providers are chosen by environment configuration.
- **Pure core, impure edges.** The availability engine is a pure function with no I/O so it can be exhaustively unit-tested.
- **Idempotency everywhere it matters.** Notification and reminder sends are keyed so retries never duplicate.

---

## 2. Tech stack

| Layer            | Choice                                                                                            | Rationale                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router, `proxy.ts` instead of middleware), TypeScript `strict`                    | SSR/SEO for public salon pages, React Server Components for admin, Route Handlers for the REST API, one deployable codebase.                                           |
| UI               | Tailwind CSS v4, shadcn/ui, lucide-react, `@dnd-kit` (reordering), `react-day-picker`, Recharts   | Composable primitives; no heavyweight admin template. The calendar grid is custom-built (see §12) to avoid licensing and to get a premium, non-generic feel.           |
| Backend          | Next.js Route Handlers (`/api/v1`) + Server Actions, both over `src/modules`                      | A second backend framework (NestJS) would double deployment, auth, and type plumbing without benefit at this stage. Modules are isolated enough to be extracted later. |
| Database         | PostgreSQL 16 (`btree_gist` extension)                                                            | Required for the range exclusion constraint that makes double-booking impossible.                                                                                      |
| ORM              | Prisma 7 (`prisma-client` generator, `pg` driver adapter, `prisma.config.ts`)                     | Type-safe queries and migrations. Raw SQL is used in migrations for the exclusion constraint, composite FKs and partial indexes.                                       |
| Authentication   | Better Auth (self-hosted)                                                                         | Email/password, email verification, password reset, optional Google OAuth, database sessions. Data stays in our Postgres. Authorization is implemented by us (§7).     |
| Jobs / queue     | pg-boss (Postgres-backed) + transactional outbox                                                  | No Redis to operate. Delayed jobs, retries, backoff, singleton keys and cron are built in. Behind a `JobQueue` interface so BullMQ can be swapped in if scale demands. |
| Email            | Resend adapter; react-email templates; Mailpit in development                                     | Provider is configuration, never hardcoded.                                                                                                                            |
| Push             | Web Push (VAPID) via `web-push`                                                                   | `PushSubscription.platform` reserves room for FCM/APNs adapters for native apps.                                                                                       |
| Object storage   | S3-compatible adapter (Cloudflare R2 in production, MinIO in development), `sharp` for processing | R2 has zero egress fees; MinIO makes local development fully offline.                                                                                                  |
| Time             | `date-fns` v4 + `@date-fns/tz`                                                                    | Explicit, DST-safe wall-clock ↔ UTC conversions.                                                                                                                       |
| Validation       | Zod 4                                                                                             | One schema for API input, Server Action input and forms.                                                                                                               |
| i18n             | `next-intl`                                                                                       | `[locale]` routing, message files `messages/bs.json` and `messages/en.json`, reused for emails.                                                                        |
| Logging / errors | `pino` structured logs; `@sentry/nextjs` behind an `ErrorTracker` interface; PostHog optional     |                                                                                                                                                                        |
| Rate limiting    | `RateLimiter` interface; Postgres fixed-window adapter in v1                                      | No Redis dependency; Redis adapter later if needed.                                                                                                                    |
| Testing          | Vitest 5 (unit + integration on real Postgres), Playwright (E2E), fake providers                  | See [testing.md](./testing.md).                                                                                                                                        |
| Repo layout      | Single Next.js app + `src/worker` entry (no monorepo)                                             | Less tooling for a small team. ESLint import-boundary rules keep modules extractable.                                                                                  |
| Deployment       | Docker: `web` and `worker` images, managed Postgres, R2                                           | Railway / Fly.io / Hetzner + Coolify. See [setup.md](./setup.md).                                                                                                      |

### Deviations from the original brief and why

- **pg-boss instead of Redis + BullMQ.** Postgres is already required, so a Postgres-backed queue removes one stateful service. More importantly, jobs are enqueued through an outbox table inside the same transaction as the booking write, so a booking can never be committed without its notification, and a notification can never be emitted for a rolled-back booking.
- **No NestJS.** The service layer already provides the separation of concerns NestJS would give, without the second runtime.
- **Better Auth instead of Auth.js/Clerk.** Confirmed with the product owner: self-hosted, TypeScript-first, strong email/password support, no per-user pricing.
- **`Role` and `BookingStatus` are enums, not tables.** Roles and statuses are static and mapped to code-level permission and transition tables. A database table would add joins and allow runtime drift with no product benefit.

---

## 3. System overview

```
                 ┌──────────────────────────────────────────────────────────┐
                 │                        Browser / PWA                     │
                 │  public salon page · booking flow · client dashboard     │
                 │  salon admin · super admin · service worker (push)       │
                 └──────────────┬───────────────────────────┬───────────────┘
                                │ HTTPS (RSC, Server Actions, /api/v1)      │ Web Push
                                ▼                                           │
┌────────────────────────────────────────────────────────┐                  │
│                    web (Next.js, Docker)               │                  │
│  app/ adapters → modules/ (domain) → lib/ (infra)      │                  │
│  Better Auth · Zod · tenant-scoped Prisma              │                  │
└──────────────┬──────────────────────────┬──────────────┘                  │
               │ SQL                      │ S3 API                          │
               ▼                          ▼                                 │
┌──────────────────────────┐   ┌────────────────────┐                       │
│ PostgreSQL 16            │   │ Object storage     │                       │
│ app schema + pgboss      │   │ (R2 / MinIO)       │                       │
└──────────────┬───────────┘   └────────────────────┘                       │
               │ SQL (pg-boss polling, outbox relay)                        │
               ▼                                                            │
┌────────────────────────────────────────────────────────┐                  │
│                  worker (Node, Docker)                 │                  │
│  outbox relay · notification dispatcher · reminders    │──── Email ──▶ Resend / Mailpit
│  image post-processing (optional) · cron sweeps        │──── Push  ──▶ Web Push endpoints
└────────────────────────────────────────────────────────┘
```

Both `web` and `worker` are built from the same repository and share `src/modules` and `src/lib`. The worker never serves HTTP except a `/health` endpoint.

---

## 4. Repository structure

```
frizerski-salon/
├─ docs/                         This documentation
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/                Prisma migrations incl. hand-written SQL (exclusion constraint, composite FKs)
│  └─ seed.ts                    Development seed (Studio Example)
├─ messages/                     bs.json, en.json (next-intl)
├─ public/                       sw.js (push service worker), icons, manifest
├─ src/
│  ├─ app/                       Next.js App Router — adapters only, no business logic
│  │  ├─ [locale]/
│  │  │  ├─ (public)/            /, /salon/[slug], /salon/[slug]/book, /b/[token] (guest manage)
│  │  │  ├─ (auth)/              /login, /register, /verify, /forgot-password, /reset-password
│  │  │  ├─ (client)/account/    /account, /account/bookings, /account/profile, /account/notifications
│  │  │  ├─ (admin)/admin/[salonSlug]/
│  │  │  │     dashboard, calendar, appointments, employees, services, customers,
│  │  │  │     salon, working-hours, availability, gallery, notifications, settings, audit
│  │  │  └─ (platform)/platform/ super admin: salons, users, stats, settings
│  │  ├─ api/
│  │  │  ├─ auth/[...all]/       Better Auth handler
│  │  │  ├─ v1/**                REST API (see api.md)
│  │  │  └─ health/
│  │  ├─ layout.tsx, globals.css, not-found.tsx, error.tsx
│  ├─ modules/                   Domain modules (one folder per bounded context)
│  │  ├─ auth/                   session helpers, authorize(), permissions map, actor types
│  │  ├─ tenant/                 TenantContext, tenant-scoped Prisma extension
│  │  ├─ salons/                 salon profile, settings, working hours, closures
│  │  ├─ employees/              employees, schedules, breaks, time off, blocked times
│  │  ├─ services/               categories, services, employee-service mapping
│  │  ├─ booking/
│  │  │  ├─ engine/              PURE: availability.ts, intervals.ts, slots.ts, policies.ts, state-machine.ts
│  │  │  ├─ booking.service.ts   transactions: create / reschedule / cancel / status change
│  │  │  ├─ availability.service.ts  loads inputs and calls the engine
│  │  │  └─ schemas.ts, repository.ts, permissions.ts, errors.ts
│  │  ├─ customers/
│  │  ├─ notifications/          dispatcher, templates/, providers/email/*, providers/push/*, reminders.ts
│  │  ├─ media/                  storage providers, image pipeline (sharp), gallery
│  │  ├─ analytics/              dashboard aggregates
│  │  ├─ audit/                  audit log writer + reader
│  │  ├─ jobs/                   JobQueue interface, pg-boss adapter, job names, handlers registry, outbox relay
│  │  └─ platform/               super-admin operations
│  ├─ lib/                       Infrastructure, no domain knowledge
│  │  ├─ db.ts                   Prisma client singleton
│  │  ├─ env.ts                  Zod-validated environment
│  │  ├─ logger.ts               pino + request context
│  │  ├─ errors.ts               AppError hierarchy, error → HTTP mapping
│  │  ├─ api/defineRoute.ts      Route Handler wrapper: auth, validation, rate limit, error mapping, logging
│  │  ├─ api/defineAction.ts     Server Action wrapper with the same guarantees
│  │  ├─ time/                   tz helpers (wall-clock ↔ UTC), interval math
│  │  ├─ rate-limit/             RateLimiter interface + Postgres adapter
│  │  ├─ cache/                  small TTL cache interface (memory adapter, Redis-ready)
│  │  └─ observability/          ErrorTracker interface, Sentry adapter, analytics adapter
│  ├─ components/
│  │  ├─ ui/                     shadcn/ui primitives
│  │  ├─ admin/                  shell, sidebar, data tables, filters
│  │  ├─ calendar/               day/week/month grid, event chips, detail drawer
│  │  ├─ booking/                mobile-first booking flow steps
│  │  ├─ public/                 salon page sections
│  │  └─ forms/                  react-hook-form + zod field components
│  ├─ i18n/                      routing.ts, request.ts, formatters
│  └─ worker/
│     └─ index.ts                pg-boss bootstrap, handler registration, outbox relay loop, cron sweeps, /health
├─ tests/
│  ├─ unit/                      engine, policies, permissions, reminders
│  ├─ integration/               real Postgres: booking tx, tenant isolation, outbox
│  ├─ e2e/                       Playwright flows
│  └─ fixtures/                  factories and builders
├─ docker-compose.yml            postgres, minio, mailpit (dev) + postgres-test
├─ Dockerfile                    multi-stage: `web` and `worker` targets
├─ .env.example
├─ eslint.config.mjs             includes import boundary rules
├─ vitest.config.ts, playwright.config.ts
└─ package.json
```

### Module anatomy

Each module in `src/modules/<name>/` follows the same shape:

| File             | Responsibility                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `schemas.ts`     | Zod input/output schemas and inferred types. Shared by API, actions and forms.                                                      |
| `service.ts`     | Use cases. Receives a `Context` (see §6), performs authorization, orchestrates repositories, transactions, audit and outbox events. |
| `repository.ts`  | Prisma queries only. Always receives the tenant-scoped client. No business rules.                                                   |
| `permissions.ts` | Permission keys the module defines (e.g. `booking.create`, `booking.updateStatus`).                                                 |
| `errors.ts`      | Module-specific `AppError` subclasses (e.g. `SlotUnavailableError`).                                                                |
| `index.ts`       | Public surface of the module. Other modules import only from here.                                                                  |

### Import boundaries (enforced by ESLint)

```
app/*          → modules/*, components/*, lib/*
modules/*      → other modules' index.ts, lib/*          (never app/*, never components/*)
modules/booking/engine/* → lib/time/* only                 (no Prisma, no fetch, no Date.now())
lib/*          → lib/* only                                (no modules, no app)
worker/*       → modules/*, lib/*
components/*   → components/*, lib/*, modules/*/schemas.ts (types only)
```

---

## 5. Request lifecycle

Every entry point (Route Handler, Server Action, RSC page loader) goes through the same pipeline:

```
request
  → defineRoute / defineAction
      1. request id + logger child
      2. rate limit (key: route + IP or user)
      3. resolve session (Better Auth) → Actor { userId, platformRole, memberships[] } | Anonymous
      4. resolve tenant (from :salonId / :slug / membership) → TenantContext
      5. Zod-parse params/query/body
      6. call module service(ctx, input)
      7. map result → { data, meta } envelope
      8. map AppError → HTTP status + { error: { code, message, details } }; log unexpected errors with stack; report to ErrorTracker
```

Services always call `authorize(ctx, permission, resource?)` first. Permission checks are never done only in React.

---

## 6. Multi-tenancy

**Model:** shared database, shared schema, `salonId` column on every tenant-owned table. This is the right trade-off for hundreds to thousands of small tenants: one migration path, simple operations, cheap per-tenant cost.

### Isolation layers (defense in depth)

1. **Explicit `TenantContext`.** Service functions receive `ctx: { salonId, actor, requestId }`. There is no ambient tenant.
2. **Tenant-scoped Prisma client.** `modules/tenant/prisma-tenant.ts` returns a Prisma client extension (`$extends`) where every query on a tenant model automatically receives `where: { salonId }` and every create receives `data: { salonId }`. Repositories only ever receive this scoped client. Using the raw client on tenant models outside `modules/tenant` and `modules/platform` is a lint error.
3. **Composite foreign keys at the database.** Tenant tables carry `UNIQUE (salon_id, id)`. Cross-references are declared as composite FKs, for example `Booking(salon_id, service_id) → Service(salon_id, id)`. Even a buggy write cannot link a booking to another salon's service, employee or customer.
4. **Storage key prefixing.** Objects live under `salons/{salonId}/…`; the media module only signs/serves keys under the tenant's prefix.
5. **Audited platform bypass.** Super-admin operations use `platformContext(actor)` which unlocks cross-tenant queries and writes an `AuditLog` row for every mutation.
6. **Optional Postgres RLS (Phase 15).** Policies keyed on `current_setting('app.salon_id')` set with `SET LOCAL` inside each transaction. Deferred: it complicates connection pooling and the three layers above already give strong guarantees.

### Tenant models

Everything except: `User`, `Session`, `Account`, `Verification`, `NotificationPreference`, `PushSubscription`, `PlatformSetting`, `RateLimitBucket`, and pg-boss tables. `Salon` itself is the tenant root. `SalonMembership`, `AuditLog`, `Notification` and `OutboxEvent` carry a nullable `salonId` because some rows are platform-level.

### Implementation notes (Phase 3)

- `modules/tenant/scope.ts` holds the pure argument rewriting (`scopeArgs`) used by the Prisma extension in `prisma-tenant.ts`; it is unit-tested per operation. Any explicit reference to another salon (`where.salonId`, `data.salonId`, `Salon.where.id`) throws `TenantScopeError` (500, logged) instead of silently returning nothing.
- `modules/tenant/models.ts` is the registry of tenant models. `tests/unit/tenant-models.test.ts` parses `prisma/schema.prisma` and fails when a model with a `salonId` column is missing from the registry, so a new table cannot bypass scoping unnoticed.
- Convention: repositories still pass `salonId: ctx.salonId` explicitly on create (Prisma's types require it); the extension verifies it equals the context. The raw client is reserved for non-tenant models, `platformContext()` and the auth adapter.
- `resolveTenantContext(principal, { id } | { slug })` returns `{ salonId, salonSlug, actor, role, db }`. Non-members get 404, anonymous 401, owners of a `SUSPENDED` salon 403; `SUPER_ADMIN`s resolve any salon with `role = "PLATFORM"`.
- `SalonMembership` carries `UNIQUE (salon_id, id)`; the same pattern is applied to every tenant table added later so composite FKs can reference `(salonId, id)`.

### Implementation notes (Phase 4)

- Salon management lives in `modules/salons`: `salon.service.ts` (profile, settings, opening hours, closures; every mutation audited with a field-level diff from `modules/audit/diff.ts`) and `public.service.ts` (anonymous read of ACTIVE salons with only public fields).
- Admin pages under `app/[locale]/(admin)/admin/[salonSlug]/` share one `AdminShell` (sidebar on desktop, sheet on mobile) and resolve the tenant once per request through `_context.ts` (`React.cache`). Unimplemented sidebar entries render disabled with a "soon" badge until their phase lands.
- Server Actions use `defineAuthedAction` + `resolveTenantContext` and call `updateTag("salon:{slug}")`; REST routes call `revalidateTag(tag, "max")`. The public page reads through `unstable_cache` keyed by slug and day with a 5-minute fallback, so admin edits are visible immediately while anonymous traffic never waits on the database.

### Implementation notes (Phase 5)

- `modules/employees` owns employees, the weekly schedule (`EmployeeSchedule` rows = shifts, `EmployeeBreak` rows = breaks inside a shift; `setSchedule` replaces the open-ended schedule atomically), time off (`EmployeeTimeOff`, entered as local dates/times and converted to UTC with the salon time zone) and blocked times (`BlockedTime`, `employeeId = null` = whole salon).
- Account linking: `inviteEmployeeUser` links an existing user as an `EMPLOYEE` member with `employeeId`, or sends an invitation email when no account exists. Composite FKs `(salon_id, employee_id)` on `salon_memberships` and `blocked_times` are added in raw SQL because Prisma cannot mix required and optional relation fields.
- Admin pages: Employees (list, create, detail with profile / schedule editor / time off / access) and Availability (blocked times + team absences). REST routes for staff are scheduled for the API completeness pass (Phase 14); the web UI uses Server Actions.
- E2E suites run desktop and mobile projects in parallel, so each project edits its own seeded salon and the platform status test uses the dedicated `status-demo` salon. `tests/e2e/fixtures.ts` waits for the `HydrationMarker` after every `page.goto` so clicks never race React hydration.

### Implementation notes (Phase 6)

- `modules/services` owns categories, services and the employee ↔ service mapping. Prices are integer cents with the salon currency copied onto the service at creation (`lib/money.ts` parses "20,50" style input and formats with `Intl`). Price changes are audited as `service.priceChanged` with before/after values.
- Provider assignment is edited on the service (checkbox list); `listServicesForEmployee` is the read the booking engine uses. Category deletion keeps services (`ON DELETE SET NULL` through the composite FK).
- Admin: Services page (grouped list with reorder, active toggle, delete) + categories panel; create/edit forms. Public page gains the grouped price list.

### Implementation notes (Phase 7)

- `modules/booking/engine` is the pure core (`intervals.ts`, `availability.ts`, `any-employee.ts`, `policies.ts`, `state-machine.ts`); it imports only `lib/time` and is covered by table-driven and property-based unit tests (brief example, breaks, buffers, closures, notice/horizon, DST days, reschedule exclusion).
- `availability.service.ts` loads one `AvailabilityContext` per (salon, service, employees, date range) with a handful of indexed queries and answers per-day questions in memory; the same context builder runs inside the booking transaction with the transaction client.
- `booking.service.ts` implements create / reschedule / cancel / status change exactly as in docs/booking-system.md §6: per-employee `pg_advisory_xact_lock`, fresh re-validation, insert guarded by the `bookings_no_overlap` exclusion constraint (SQLSTATE 23P01 → `SlotUnavailableError`), history row, `BookingReminder` rows, guest `BookingAccessToken` (SHA-256 at rest), audit row for staff actions and an `OutboxEvent` in the same transaction. "Any employee" ranks candidates (fewest bookings that day, then sort order) and falls through when a candidate loses the race.
- Public REST: availability, month summary, create booking, guest manage (view / reschedule / cancel by token). Client REST under `/me/bookings`; staff REST under `/salons/:salonId/bookings` (employees only see and complete their own). The booking wizard and manage page call these routes directly, so the canonical API is exercised by the web UI.
- Admin "Appointments" page lists upcoming/past bookings with status actions; the full calendar arrives in Phase 8. Confirmation emails are emitted as outbox events and delivered once the worker lands in Phase 10.

### Implementation notes (Phase 8)

- The admin calendar lives at `/admin/[salonSlug]/calendar` and is a server component that reads `view` (day | week | month), `date` (local date in the salon time zone) and `employee` from the query string, computes the visible range with pure helpers in `components/calendar/layout.ts` and issues range-bounded queries (`listBookingsForSalon({ from, to })`, blocked times, time off). Month view covers the 6-week grid; week view 7 days; day view one day with one column per employee.
- All positioning is done in local minutes: bookings, blocked times and absences are converted to `{ date, startMin, endMin }` on the server, so the client grid never touches time zones. Overlapping items share the column via `assignColumns()` (interval-graph colouring); cancelled bookings render beneath active ones so they never intercept clicks.
- The detail drawer reuses the staff REST routes (`/status`, `/reschedule`) with the booking `version` for optimistic locking; allowed actions come from the shared state machine (`allowedTransitions`). Moving a booking fetches slots from the staff availability route with `ignoreNotice=true` and lets the operator change employee and day.
- "New booking" (button or double-click on a free spot) posts to `POST /salons/:salonId/bookings` with `source = ADMIN | WALK_IN` and the initial status; it supports "any available employee" by using the first eligible employee of the chosen slot. The dedicated `GET /salons/:salonId/calendar` endpoint from docs/api.md is not needed for the web UI (the server component composes the data) and remains a Phase 14 item for API completeness.

### Implementation notes (Phase 9)

- `modules/account` owns everything a client can change about themselves: profile (`updateProfile` keeps Better Auth's `name` in sync with first/last name), `NotificationPreference` (lazy row; defaults come from code until the first save) and `claimGuestCustomers()`, which links guest `Customer` rows carrying the user's **verified** email to the account (or merges their bookings into the account's existing customer record in that salon). Claiming runs on every account page load through `requireClient()`, so a guest who registers later sees their old bookings immediately.
- The account area is a nested layout (`/account`, `/account/bookings?scope=`, `/account/profile`, `/account/notifications`) with a tab navigation. Upcoming bookings reuse the same `ManageBooking` component as the guest page, pointed at the session endpoints (`/me/bookings/:id/cancel|reschedule`), so policy messaging and slot re-validation behave identically for guests and clients.
- REST: `GET/PATCH /me` and `GET/PUT /me/notification-preferences`. Profile and preference forms use Server Actions bound to the same module functions. Push preferences are stored now but the toggle stays disabled until Phase 11 delivers subscriptions.

- `lib/time` holds the pure wall-clock/time-zone helpers (`wallClockToUtc`, `weekdayInTimeZone`, `localDateString`, …) used by the public "open now" indicator and, later, the booking engine. ESLint forbids `Date.now()` inside it.

---

## 7. Authentication and RBAC

### Authentication (Better Auth)

- Email + password (Better Auth's scrypt hashing), verification email on sign-up. Sign-in is allowed before verification so clients get to their dashboard immediately; salon-side (staff) features call `requireVerifiedEmail()` and refuse unverified accounts.
- Session cookie cache is **disabled**: every request performs one indexed session lookup so that revoked sessions and deactivated users (`User.isActive = false`) are rejected on the very next request. `resolveActorFromHeaders()` in `modules/auth/session.ts` is the single place that turns a request into an `Actor` (user fields + salon memberships).
- Better Auth's built-in rate limiter is enabled outside tests (sign-in/sign-up 10 per minute per IP, password reset and verification resend 5 per minute).
- The `nextCookies` plugin is only registered inside the Next.js runtime; the worker, seed script and tests build the same `createAuth()` configuration without it.
- The seed script creates credential accounts the same way Better Auth does (`accounts.provider_id = "credential"`, `hashPassword` from `better-auth/crypto`) without going through HTTP.
- Optional Google OAuth (`GOOGLE_CLIENT_ID/SECRET` present → enabled).
- Database sessions (`Session` table), httpOnly `SameSite=Lax` cookies, sliding expiry, revocable from the account page.
- Better Auth is mounted at `/api/auth/[...all]`. Our code only calls `getSession()`; the library is replaceable behind `modules/auth/session.ts`.

### Roles

| Scope    | Role                         | Stored in                                                        |
| -------- | ---------------------------- | ---------------------------------------------------------------- |
| Platform | `SUPER_ADMIN`                | `User.platformRole` (nullable)                                   |
| Salon    | `OWNER`, `ADMIN`, `EMPLOYEE` | `SalonMembership(userId, salonId, role, employeeId?)`            |
| Implicit | Client                       | Any authenticated user; guests act through signed booking tokens |

A user can hold memberships in several salons with different roles and still be a client elsewhere. `OWNER` differs from `ADMIN` only in the ability to transfer ownership, delete the salon and manage admins.

### Permission map (excerpt; full map in `modules/auth/permissions.ts`)

| Permission                                                                    |     SUPER_ADMIN     | OWNER | ADMIN | EMPLOYEE |      Client      |
| ----------------------------------------------------------------------------- | :-----------------: | :---: | :---: | :------: | :--------------: |
| `salon.read` (public data)                                                    |          ✓          |   ✓   |   ✓   |    ✓     |        ✓         |
| `salon.update`, `settings.update`, `workingHours.update`                      |          ✓          |   ✓   |   ✓   |          |                  |
| `salon.delete`, `membership.manageAdmins`                                     |          ✓          |   ✓   |       |          |                  |
| `employee.*`, `service.*`, `gallery.*`, `customer.read`                       |          ✓          |   ✓   |   ✓   |          |                  |
| `booking.readAll`, `booking.create`, `booking.update`, `booking.updateStatus` |          ✓          |   ✓   |   ✓   |          |                  |
| `booking.readOwnAsEmployee`, `booking.updateStatus:COMPLETED                  | NO_SHOW` (own only) |       |       |          |        ✓         |     |
| `booking.createAsClient`, `booking.rescheduleOwn`, `booking.cancelOwn`        |                     |       |       |          | ✓ (+guest token) |
| `analytics.read`, `audit.read`                                                |          ✓          |   ✓   |   ✓   |          |                  |
| `platform.*`                                                                  |          ✓          |       |       |          |                  |

`authorize(ctx, permission, resource?)` resolves the actor's role for `ctx.salonId` from memberships and throws `ForbiddenError` (403) or `NotFoundError` (404, when leaking existence would be a tenant-isolation risk).

### Guest bookings

A guest provides name, email and phone. A `Customer` row is created (or reused by `(salonId, email)`), and a `BookingAccessToken` (random 32 bytes, stored hashed, valid until the appointment ends + 7 days) is emailed. The token authorizes view/reschedule/cancel of that one booking under the salon's policy. When a user later registers and verifies the same email, `Customer.userId` is linked and the history appears in their dashboard.

---

## 8. Cross-cutting concerns

### Configuration

`lib/env.ts` parses `process.env` with Zod at startup. Missing or malformed variables fail fast with a readable message. Providers are chosen by `EMAIL_PROVIDER`, `PUSH_PROVIDER`, `STORAGE_PROVIDER`, `ERROR_TRACKER` (see [setup.md](./setup.md)).

### Error handling

- `AppError(code, message, status, details?)` base class with subclasses: `ValidationError` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, `SlotUnavailableError` 409, `PolicyViolationError` 422, `RateLimitedError` 429.
- Adapters map `AppError` to the response envelope; any other error becomes a generic 500 with a request id, is logged with full stack, and reported to the `ErrorTracker`.
- The UI shows translated, human messages by `error.code`; stack traces never reach the client. `app/error.tsx` boundaries catch render errors.

### Logging

`pino` JSON logs with `requestId`, `userId`, `salonId`, `route`, `durationMs`. The worker logs `jobId`, `jobName`, `attempt`. Pretty-printed in development.

### Internationalization

- Locales: `bs` (default), `en`. Adding a locale = adding `messages/<locale>.json` and one entry in `i18n/routing.ts`.
- All UI copy comes from message files; no literal strings in components (lint rule via `eslint-plugin-i18n-json` + review).
- Locale resolution: URL segment → user preference → salon default → `bs`.
- Emails and push payloads are rendered with the recipient's locale (user preference, else salon default).
- Dates, currency and numbers are formatted with `Intl` using the salon's `timezone` and `currency`.

### Time and timezone

- All instants are stored as `timestamptz` in UTC (`startsAt`, `endsAt`, `createdAt`, …).
- Recurring schedules and opening hours are stored as wall-clock strings `"HH:mm"` plus weekday, and are interpreted in `Salon.timezone` for a specific date at query time.
- Every conversion goes through `lib/time` (`zonedWallClockToUtc(date, "HH:mm", tz)`, `utcToZoned(instant, tz)`). Direct `new Date(year, month, …)` construction is a lint error outside `lib/time`.
- DST is handled per date, see [booking-system.md §5](./booking-system.md#5-timezones-and-dst).
- The engine receives `now` as a parameter; it never calls `Date.now()`.

### Caching

`lib/cache` exposes `get/set/del` with TTL and tag invalidation. The v1 adapter is in-process memory (safe because entries are short-lived and keyed by tenant); Redis adapter later. Used for public salon page data (60 s) and availability responses (30 s, invalidated on booking writes for that employee/day).

### Rate limiting

`RateLimiter.hit(key, limit, windowSec)` with a Postgres fixed-window adapter (`RateLimitBucket`, `INSERT … ON CONFLICT DO UPDATE`). Limits are declared per route in `defineRoute`.

### Audit logging

`audit.record(ctx, { action, entityType, entityId, before, after })` is called from services for every admin mutation. `before`/`after` are diffed snapshots limited to whitelisted fields (no password hashes, no tokens). See [database.md](./database.md#auditlog).

---

## 9. Media and image storage

- `StorageProvider` interface: `putObject(key, body, contentType)`, `deleteObject(key)`, `deletePrefix(prefix)`, `publicUrl(key)`, `presignUpload(key, contentType, maxBytes)` (optional).
- Adapters: `S3StorageProvider` (R2, AWS S3, MinIO via `@aws-sdk/client-s3`), `FakeStorageProvider` (in-memory, tests).
- Upload pipeline (`modules/media/pipeline.ts`):
  1. Multipart upload to `POST /api/v1/salons/:salonId/images` (max 10 MB, max 20 files per gallery request).
  2. Validate MIME by magic bytes (`file-type`), allow `jpeg|png|webp|heic|avif`; reject SVG (script risk).
  3. Decode with `sharp`, enforce max 8000×8000, auto-rotate, strip metadata.
  4. Generate variants: `thumb` 320px, `md` 800px, `lg` 1600px (WebP q80) + `orig` (re-encoded WebP/AVIF, capped at 2400px). Compute a blurhash placeholder.
  5. Store under `salons/{salonId}/{purpose}/{imageId}/{variant}.webp`. Insert `Image` row with `variants` JSON (`{ variant: { key, width, height, bytes } }`).
  6. Deletion removes the DB row and all objects under the image prefix (async job with retry).
- Front end: `<SalonImage image variant sizes>` wraps `next/image` with a custom loader that serves the stored variants (no on-the-fly Next optimization cost). Drag & drop + reorder with `@dnd-kit`; crop for logo/avatar with `react-easy-crop` before upload.
- Heavy processing can move from the request path to a worker job (`image.process`) with no API change; the `Image.status` (`PROCESSING|READY|FAILED`) column exists from day one.

---

## 10. Background jobs

### Components

- **Outbox (`OutboxEvent`)**: domain events (`booking.created`, `booking.rescheduled`, `booking.cancelled`, `booking.statusChanged`, `employee.created`, …) written _inside_ the business transaction.
- **Relay** (worker loop, every 2 s, `SELECT … FOR UPDATE SKIP LOCKED`): publishes each event to pg-boss as a job and marks it processed. Exactly-once publish is not required because handlers are idempotent.
- **pg-boss**: job storage in the `pgboss` schema, retries with exponential backoff (3 attempts by default, 5 for sends), dead-letter queue, delayed jobs for reminders, cron for sweeps.
- **Handlers** (`modules/jobs/handlers/*`): `notification.dispatch`, `notification.sendEmail`, `notification.sendPush`, `reminder.send`, `reminder.sweep` (cron `* * * * *`), `image.process`, `image.delete`, `maintenance.purgeExpiredTokens` (daily).

### Guarantees

- Booking commit ⇒ event exists (same transaction). Booking rollback ⇒ no event.
- Every send is keyed (`Notification.dedupeKey` unique, `BookingReminder` status transition `SCHEDULED → SENT` done with a conditional `UPDATE … RETURNING`), so a retried job cannot send twice.
- The worker is horizontally scalable: pg-boss uses `SKIP LOCKED` job fetching.
- The web container never depends on the worker being up; it only writes rows.

`JobQueue` interface (`send(name, payload, opts)`, `schedule(name, payload, runAt, singletonKey)`, `cancel(jobId)`, `work(name, handler)`) is the only surface the rest of the code touches.

---

## 11. Observability

- **Logs**: pino JSON to stdout, collected by the host platform.
- **Errors**: `ErrorTracker` interface → Sentry adapter (`@sentry/nextjs` for web, `@sentry/node` for worker) or no-op. Request id is attached as a tag.
- **Product analytics**: `Analytics` interface → PostHog adapter or no-op. Events: booking funnel steps, booking created, cancellations.
- **Health**: `GET /api/health` (web) and `GET /health` (worker) check DB connectivity and, for the worker, pg-boss heartbeat and outbox lag.
- **Job monitoring**: platform admin page reads pg-boss tables (queued, active, failed counts, oldest pending) and `OutboxEvent` lag.
- **Audit**: `AuditLog` per salon, readable in the admin UI.

---

## 12. Front-end architecture notes

- **Public salon page** (`/[locale]/salon/[slug]`): fully server-rendered, cached 60 s, revalidated by tag on any salon content change (`revalidateTag('salon:'+id)`). Content edits by the admin are visible immediately.
- **Booking flow** (`/salon/[slug]/book`): mobile-first, a single page with steps (service → staff → date/time → details → confirm) kept in URL search params so it is resumable and shareable. Availability is fetched per day; the client never computes availability.
- **Admin shell**: responsive sidebar (collapsible on tablet, bottom sheet navigation on mobile). Data tables with server-side filtering/pagination.
- **Calendar**: custom CSS-grid day/week views with time gutter and per-employee columns, month view as a density grid. Events are positioned by minutes from day start; status determines color tokens. Clicking an event opens a detail drawer with status actions. Data is fetched per visible range only.
- **Client dashboard**: upcoming / past / cancelled tabs, reschedule reuses the booking flow's date/time step.
- **Design tokens**: neutral premium palette, one accent color per salon optional (stored on `Salon.brandColor`, applied as a CSS variable on public pages).

---

## 13. Security summary

Detailed controls are listed per area in the sections above and in [api.md](./api.md#security). Summary:

- Authentication: Better Auth, argon2id, email verification, session revocation, optional OAuth.
- Authorization: `authorize()` on every entry point; permission map in code; employees restricted to own bookings.
- Tenant isolation: explicit context, scoped Prisma client, composite FKs, storage prefixing, audited platform bypass.
- Input validation: Zod on all params/query/body; size limits on bodies and uploads.
- Injection: Prisma parameterization; raw SQL only in migrations and two locked-down helpers (advisory lock, reminder claim) with typed parameters.
- XSS: React escaping, strict CSP (`script-src 'self' 'nonce-…'`), rich text (salon description) sanitized with an allowlist on the server.
- CSRF: SameSite cookies, Next.js Server Action origin check, Better Auth CSRF protection on its endpoints; REST mutations require a session cookie plus `Origin` validation.
- Uploads: magic-byte validation, re-encoding via sharp (drops embedded payloads and metadata), random keys, no SVG.
- Rate limiting on auth, public booking and availability endpoints.
- Secrets only via environment; `.env` never committed; env validated at boot.
- Security headers: HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`.
- Audit logging for all admin mutations and platform actions.
- Guest tokens hashed at rest, expiring, scoped to one booking.
- Dependency scanning in CI (`npm audit`, Renovate/Dependabot).

---

## 14. Future extension points

The schema and module layout reserve space for the roadmap items without implementing them:

| Future feature                                             | Prepared hook                                                                                                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Online payments, deposits, Stripe                          | `Booking.paymentStatus` enum (`NONE` default), `Payment` table can reference `Booking(salonId, id)`; `booking.created` event lets a payment module react.         |
| Loyalty, discount codes, gift cards, memberships, packages | `Booking.priceCents` is a snapshot; a `PriceAdjustment` table can attach line items. `Customer` is the per-salon identity to attach balances to.                  |
| Reviews                                                    | `Review(salonId, bookingId, customerId, rating, text)`; `booking.completed` event triggers a request email.                                                       |
| SMS / WhatsApp                                             | New `NotificationChannel` values and a `SmsProvider` interface in the notifications module; preference matrix already channel-based.                              |
| Native iOS/Android                                         | REST `/api/v1` is the canonical contract; `PushSubscription.platform` and provider interface accommodate FCM/APNs; Better Auth supports bearer sessions.          |
| Google / Outlook calendar sync                             | `ExternalCalendarLink(employeeId, provider, tokens)` and `booking.*` events feed an outbound sync job; inbound busy blocks map to `BlockedTime(source=EXTERNAL)`. |
| Multiple locations                                         | `Location(salonId, …)` with `locationId` on `Employee`, `WorkingHours`, `Booking`; today all rows implicitly belong to one location.                              |
| Multiple employees per booking, multi-service bookings     | `BookingItem(bookingId, serviceId, employeeId, startsAt, endsAt)`; the exclusion constraint moves to items. The engine already works on intervals.                |
| Recurring appointments                                     | `BookingSeries(rule)` + `Booking.seriesId`.                                                                                                                       |
| Subscription plans / SaaS billing                          | `Salon.plan` and `SalonSubscription` table; `PlatformSetting` for plan catalog; `SUPER_ADMIN` UI exists.                                                          |

---

## 15. Development roadmap

Each phase ends with: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` green, and docs updated.

| #   | Phase                        | Deliverables                                                                                                                                                                                                                            | Exit criteria                                          |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | Project setup + architecture | Next.js, TS strict, Tailwind/shadcn, Prisma + docker-compose Postgres, `env.ts`, logger, `AppError`, `defineRoute`/`defineAction`, next-intl skeleton, ESLint boundaries, Vitest/Playwright scaffolds, CI workflow, Dockerfile skeleton | Empty app boots in Docker; health endpoint; CI green   |
| 2   | Auth + users + roles         | Better Auth integration, register/login/verify/reset pages, `User` extensions, `SalonMembership`, `authorize()`, permission map, super-admin seed                                                                                       | Unit tests for permission map; login E2E               |
| 3   | Multi-tenant architecture    | `TenantContext`, scoped Prisma extension, composite FK migration pattern, salon creation (owner), platform salon list                                                                                                                   | Integration tests prove cross-tenant reads/writes fail |
| 4   | Salon management             | Salon profile, settings, working hours, closures; public `/salon/[slug]` (no booking yet); content revalidation                                                                                                                         | Admin edits visible on public page                     |
| 5   | Employees + schedules        | Employee CRUD, weekly schedule editor with split shifts and breaks, time off, blocked times, employee invite → membership                                                                                                               | Availability inputs complete                           |
| 6   | Services + pricing           | Categories, services, per-employee mapping/overrides, reorder, public price list filtered by audience                                                                                                                                   |                                                        |
| 7   | Booking engine               | Pure engine + exhaustive unit tests, availability API, create/reschedule/cancel transactions, exclusion constraint, guest tokens, mobile-first booking flow UI, client booking pages                                                    | Concurrency integration test passes                    |
| 8   | Calendar                     | Day/week/month, filters, status colors, detail drawer, admin create/edit/move, range-bounded queries                                                                                                                                    | Done — E2E: view, drawer, walk-in create               |
| 9   | Client dashboard             | Upcoming/past/cancelled, reschedule/cancel with policy messaging, profile, notification settings                                                                                                                                        | Done — E2E: dashboard, profile, preferences            |
| 10  | Email notifications          | Worker, outbox relay, dispatcher, react-email templates (bs/en), Resend + Mailpit adapters, reminders 24h/1h with idempotency                                                                                                           | Mailpit E2E assertions                                 |
| 11  | Push notifications           | Service worker, subscription management, WebPush adapter, staff notifications                                                                                                                                                           |                                                        |
| 12  | Image/gallery management     | Storage adapter, upload pipeline, gallery manager (drag & drop, reorder, cover), logo/avatar/service images                                                                                                                             |                                                        |
| 13  | Admin dashboard analytics    | KPIs (today, upcoming, revenue, customers, completed, cancelled, no-show), charts, customers list with stats and history                                                                                                                |                                                        |
| 14  | Testing                      | Complete integration and E2E suites, coverage thresholds, CI gates                                                                                                                                                                      | 15-step E2E passes                                     |
| 15  | Security hardening           | CSP nonce rollout, header audit, rate-limit tuning, audit coverage review, dependency audit, optional RLS                                                                                                                               | Security checklist signed off                          |
| 16  | Production deployment        | Docker images, Railway/Fly config, migrate-on-deploy, backups, Sentry, runbook                                                                                                                                                          | Production booking end-to-end                          |

---

## 16. Architecture decision log

| ID     | Decision                                                             | Alternatives                                         | Reason                                                                                                    |
| ------ | -------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ADR-1  | Single Next.js app + worker entry                                    | Turborepo monorepo; NestJS backend                   | Minimal tooling; boundaries via lint; extractable later                                                   |
| ADR-2  | Shared-schema multi-tenancy with composite FKs                       | Schema-per-tenant; DB-per-tenant                     | Thousands of small tenants; DB-enforced integrity without operational sprawl                              |
| ADR-3  | pg-boss + transactional outbox                                       | Redis + BullMQ; Vercel Cron polling                  | Atomic booking + notification; one stateful service                                                       |
| ADR-4  | Better Auth                                                          | Auth.js; Clerk                                       | Self-hosted, strong credentials support, no per-MAU cost                                                  |
| ADR-5  | Roles as enums + membership table                                    | `Role` table                                         | Static roles, code-level permission map                                                                   |
| ADR-6  | UTC instants + wall-clock schedules                                  | Store local times                                    | Correct DST handling, portable across tenants                                                             |
| ADR-7  | Exclusion constraint + per-employee advisory lock                    | `SERIALIZABLE` isolation only; app-level checks only | Deterministic conflict prevention, low contention                                                         |
| ADR-8  | Custom calendar component                                            | FullCalendar, Schedule-X                             | Premium UX, no license constraints, tight integration with domain model                                   |
| ADR-9  | Money as integer minor units                                         | Decimal                                              | No floating errors; currency per salon                                                                    |
| ADR-10 | REST `/api/v1` as canonical API, Server Actions as web convenience   | tRPC; GraphQL                                        | Mobile-ready contract, both adapters share services                                                       |
| ADR-11 | Session cookie cache disabled                                        | 5-minute signed cookie snapshot                      | Immediate effect of session revocation and user deactivation; one indexed query per request is cheap      |
| ADR-12 | Sign-in allowed before email verification; staff features require it | Block sign-in until verified                         | Low friction for clients (guests can book anyway); staff accounts still gated by `requireVerifiedEmail()` |
