# Testing Strategy

Testing is mandatory; the booking engine and tenant isolation are the areas with the highest bar.

Related: [booking-system.md §11](./booking-system.md#11-edge-cases-covered-by-tests), [setup.md §5](./setup.md#5-scripts-packagejson).

---

## 1. Pyramid

| Layer       | Tool        | Runs against                                           | Speed | Where                                          |
| ----------- | ----------- | ------------------------------------------------------ | ----- | ---------------------------------------------- |
| Unit        | Vitest      | pure functions, no DB                                  | ms    | `tests/unit`, colocated `*.test.ts` for engine |
| Integration | Vitest      | real PostgreSQL (`postgres-test`), fake providers      | s     | `tests/integration`                            |
| E2E         | Playwright  | full stack (web + worker), test DB, Mailpit, fake push | min   | `tests/e2e`                                    |
| Static      | tsc, ESLint |                                                        |       | CI gate                                        |

Coverage thresholds (CI fails below): `modules/booking/engine` 95 % lines/branches; `modules/**` 80 %; overall 70 %.

---

## 2. Unit tests

### Availability engine (`modules/booking/engine`)

Table-driven tests with human-readable wall-clock fixtures in `Europe/Sarajevo`:

- Brief example: 09:00–17:00, 60-min service, 10:00–11:00 booked → `[09,11,12,13,14,15,16]`.
- Intervals 15/30/60 with 30/45/60/90/120-minute services and custom durations.
- Alignment when schedule starts at 09:10.
- Breaks, split shifts, salon hours narrower than employee schedule, salon closure, closed weekday.
- Time off partial and multi-day; blocked time for employee and for whole salon.
- Buffers (service and salon), booking ending exactly at a block start.
- Notice (`now` injected at various offsets) and horizon (date before today, last allowed day, first disallowed day).
- Reschedule `exclude` interval.
- DST: 2026-03-29 and 2026-10-25 for Europe/Sarajevo; schedule crossing midnight; day length 23 h / 25 h; also `America/New_York` and `Australia/Lord_Howe` (30-min DST) to prove no hard-coded assumptions.
- Property test (fast-check): generated random intervals → no returned slot overlaps any busy interval, all slots lie within working time, slots are sorted and unique.

### Any-employee strategy

Union of slots and deterministic selection (fewest bookings, then `sortOrder`, then id).

### Policies and state machine

Cancel/reschedule cutoffs at boundary (`≥` allowed, `<` rejected), each status transition per actor, invalid transitions throw `InvalidTransitionError`.

### Reminder scheduling

Computation of `scheduledFor`, skipping reminders in the past, invalidation plan on reschedule/cancel.

### Pricing and duration

`resolveDurationAndPrice` with and without employee overrides; currency snapshot.

### Permissions

Full permission map × roles matrix; employee restricted to own bookings; cross-tenant membership does not grant access.

### Notifications

Preference resolution matrix (salon switches × user preferences × channel viability) produces the expected SENT/SKIPPED plan; dedupe key composition; template rendering snapshot per locale (subject + text body).

### Time helpers

`wallClockToUtc` / `utcToWallClock` round trips, `alignUp`, interval algebra (union, subtract, intersect) with edge and touching cases.

---

## 3. Integration tests

Setup: `vitest` global setup runs `prisma migrate deploy` against `DATABASE_URL_TEST`, tests run in a single worker with per-file `TRUNCATE … CASCADE` and factories from `tests/fixtures`. Providers: `EMAIL_PROVIDER=fake`, `PUSH_PROVIDER=fake`, `STORAGE_PROVIDER=fake`, `JOB_QUEUE=fake` (jobs collected in memory and run on demand with `await jobs.drain()`).

| Area                | Scenarios                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booking create      | happy path (guest, user, admin, walk-in); PENDING vs CONFIRMED by `autoConfirm`; snapshots (price, duration, name); reminders created; outbox event written; `AuditLog` for admin                                                 |
| Double-booking race | two concurrent `createBooking` for the same employee/time via two Prisma clients → exactly one succeeds, other gets `SlotUnavailableError`; also one bypassing the lock to prove the exclusion constraint alone rejects (`23P01`) |
| Booking reschedule  | own-slot move, employee change, stale version 409, client cutoff 422, old slot free afterwards, new reminders + old cancelled, event emitted                                                                                      |
| Booking cancel      | client within/outside cutoff, admin any time, status history, reminders cancelled, slot freed                                                                                                                                     |
| Status changes      | employee may complete/no-show own only; undo same day; invalid transitions                                                                                                                                                        |
| Schedule effects    | changing schedule/time off/blocked time changes availability; conflict detection with existing bookings (409 + `force`)                                                                                                           |
| Tenant isolation    | for every tenant model: read/update/delete with another salon's id → 404; composite FK rejects inserting a booking with a foreign salon's service; storage prefix enforced                                                        |
| Auth/RBAC           | route guard matrix via `defineRoute` with fake sessions; guest token: valid, expired, revoked, wrong booking                                                                                                                      |
| Customers           | guest booking with existing email reuses customer; registration links customers; merge                                                                                                                                            |
| Notifications       | dispatcher creates expected rows per matrix; send handler idempotent on retry; SKIPPED reasons; resend                                                                                                                            |
| Reminders           | claim `UPDATE` returns one row under concurrency; skipped when booking moved; sweep re-enqueues                                                                                                                                   |
| Outbox relay        | publishes pending, increments attempts, marks failed after N                                                                                                                                                                      |
| Media               | upload pipeline rejects wrong MIME/oversize, generates variants, delete cascades references                                                                                                                                       |
| Analytics           | aggregates match seeded data                                                                                                                                                                                                      |
| Rate limiter        | window rollover, per-key isolation                                                                                                                                                                                                |

---

## 4. End-to-end tests (Playwright)

Runs `next start` + worker against the test DB with `EMAIL_PROVIDER=smtp` (Mailpit) and `PUSH_PROVIDER=fake` (exposes a test-only endpoint listing sent pushes when `NODE_ENV=test`). Projects: `chromium-desktop`, `chromium-mobile` (Pixel 7 viewport) for the booking flow.

### Main flow (from the brief)

1. Super admin creates salon "Studio Example" and invites owner → owner accepts invite email (Mailpit) and sets password.
2. Owner creates employee Marko.
3. Owner creates service Haircut (20 BAM, 30 min).
4. Owner sets salon working hours and Marko's schedule.
5. Client opens `/bs/salon/studio-example`.
6. Client selects Haircut.
7. Client selects Marko.
8. Client selects a date (first bookable day).
9. Client selects a slot, enters guest details, confirms → success screen with manage link.
10. Owner sees the booking on the calendar and in Appointments.
11. Client receives confirmation email (Mailpit API assertion: recipient, subject, booking code, time in salon tz).
12. Reminders exist: DB assertion `booking_reminders` has H24 and H1 rows `SCHEDULED`.
13. Client opens manage link and moves the booking to another slot.
14. Old slot is offered again in availability.
15. New slot is no longer offered; owner's calendar shows the new time; rescheduled email arrives; reminder rows regenerated.

### Additional flows

- Registered client books, sees it under Upcoming, cancels within policy, sees it under Cancelled.
- Client tries to cancel inside the cutoff → button disabled with explanation, API returns 422.
- Employee login sees only own bookings and can mark COMPLETED.
- Admin blocks 13:00–15:00 → those slots disappear for clients.
- Gallery upload, reorder, set cover → public page reflects it.
- Language switch bs ↔ en on public and admin pages.
- Push: enable notifications in settings → subscription stored; booking → fake push recorded.
- Tenant: owner of Barber Bros cannot open Studio Example admin URLs (redirect/404).
- Accessibility smoke: `@axe-core/playwright` on public page, booking flow, admin dashboard (no serious violations).

---

## 5. Test data and helpers

- `tests/fixtures/factories.ts`: `createSalon()`, `createEmployee({ schedule })`, `createService()`, `createCustomer()`, `createBooking()`, all tenant-aware and returning typed rows.
- `tests/fixtures/time.ts`: `at('2026-10-10 09:00', tz)` helper to build instants from wall-clock strings; `FakeClock`.
- `tests/fixtures/actors.ts`: `asOwner(salon)`, `asEmployee(emp)`, `asClient(user)`, `asGuest(token)`, `asSuperAdmin()` produce contexts/sessions.
- Fake providers expose `.sent` arrays and `.reset()`.

---

## 6. Non-functional checks

- **Performance smoke** (Phase 14): seed 200 salons × 5 employees × 2 000 bookings each; measure `GET /calendar` (7 days), `GET /availability`, customers list p95 < 300 ms locally; verify `EXPLAIN` uses the intended indexes.
- **Security**: dependency audit in CI, ZAP baseline scan against the E2E stack (Phase 15), manual checklist (headers, cookie flags, CSRF, upload handling, tenant isolation).
- **Migrations**: CI applies all migrations to an empty DB and also on top of the previous release's schema snapshot.

---

## 7. Definition of done per phase

`pnpm check` green (typecheck, lint, unit + integration, build), E2E for affected flows green, new behavior covered by tests at the appropriate layer, docs updated.
