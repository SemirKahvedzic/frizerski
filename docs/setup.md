# Setup, Development and Deployment

Related: [architecture.md](./architecture.md), [testing.md](./testing.md).

---

## 1. Prerequisites

| Tool           | Version | Notes                                            |
| -------------- | ------- | ------------------------------------------------ |
| Node.js        | 22 LTS  | `.nvmrc` provided                                |
| pnpm           | 9+      | `corepack enable`                                |
| Docker Desktop | current | Postgres, MinIO, Mailpit for local dev and tests |
| Git            |         |                                                  |

Windows: use PowerShell or Git Bash; all scripts are cross-platform (`tsx`, no shell-specific commands).

---

## 2. Local services (`docker-compose.yml`)

| Service         | Image             | Port                       | Purpose                                                                  |
| --------------- | ----------------- | -------------------------- | ------------------------------------------------------------------------ |
| `postgres`      | `postgres:16`     | 5432                       | app database `salon`                                                     |
| `postgres-test` | `postgres:16`     | 5433                       | integration/E2E database `salon_test`                                    |
| `minio`         | `minio/minio`     | 9000 (S3), 9001 (console)  | S3-compatible storage, bucket `salon-media` auto-created by `minio-init` |
| `mailpit`       | `axllent/mailpit` | 1025 (SMTP), 8025 (UI/API) | catches all dev emails                                                   |

```bash
docker compose up -d
```

---

## 3. Environment variables (`.env.example`)

```bash
# --- App ---
NODE_ENV=development
APP_URL=http://localhost:3000                 # public origin; used for links, CSRF Origin check
APP_NAME=Bookly
DEFAULT_LOCALE=bs
LOG_LEVEL=debug

# --- Database ---
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/salon?schema=public
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/salon_test?schema=public
DATABASE_POOL_MAX=10

# --- Auth (Better Auth) ---
BETTER_AUTH_SECRET=change-me-32-bytes-min       # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=                             # optional; OAuth enabled when both set
GOOGLE_CLIENT_SECRET=

# --- Email ---
EMAIL_PROVIDER=smtp                           # smtp | console | fake  (resend added in the notifications phase)
EMAIL_FROM="Bookly <no-reply@localhost>"
RESEND_API_KEY=
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false

# --- Push ---
PUSH_PROVIDER=webpush                         # webpush | fake
VAPID_PUBLIC_KEY=                             # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@localhost
NEXT_PUBLIC_VAPID_PUBLIC_KEY=                 # same as VAPID_PUBLIC_KEY, exposed to the browser

# --- Storage ---
STORAGE_PROVIDER=s3                           # s3 | fake
S3_ENDPOINT=http://localhost:9000             # R2: https://<account>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=salon-media
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true                      # true for MinIO, false for R2/AWS
S3_PUBLIC_BASE_URL=http://localhost:9000/salon-media   # CDN/public bucket URL
UPLOAD_MAX_BYTES=10485760

# --- Jobs ---
JOB_QUEUE=pgboss                              # pgboss | fake
PGBOSS_SCHEMA=pgboss
OUTBOX_POLL_MS=2000
WORKER_HEALTH_PORT=3001

# --- Observability ---
ERROR_TRACKER=none                            # none | sentry
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
ANALYTICS_PROVIDER=none                       # none | posthog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# --- Rate limiting / cache ---
RATE_LIMIT_PROVIDER=postgres                  # postgres | memory
CACHE_PROVIDER=memory                         # memory (Redis later)

# --- Seed ---
SEED_SUPER_ADMIN_EMAIL=admin@platform.local
SEED_SUPER_ADMIN_PASSWORD=Admin12345!
SEED_OWNER_PASSWORD=Owner12345!

# --- Testing ---
AUTH_RATE_LIMIT=on                            # "off" only for automated E2E runs (CI sets this)
```

`src/lib/env.ts` validates all of this at boot with Zod; provider-specific keys are required only when that provider is selected.

---

## 4. First run

```bash
git clone <repo> && cd frizerski-salon
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate            # prisma migrate dev
pnpm db:seed               # Studio Example, Marko/Ana/Sara, services, customers, bookings
pnpm dev                   # web on :3000 and worker together (concurrently)
```

Open:

- Public salon: <http://localhost:3000/bs/salon/studio-example>
- Admin: <http://localhost:3000/bs/admin/studio-example> (owner: `owner@studio-example.local` / `SEED_OWNER_PASSWORD`)
- Platform: <http://localhost:3000/bs/platform> (`SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`)
- Mailpit: <http://localhost:8025>
- MinIO console: <http://localhost:9001>

---

## 5. Scripts (`package.json`)

| Script                             | Does                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                         | `concurrently "next dev" "tsx watch src/worker/index.ts"`               |
| `pnpm dev:web` / `pnpm dev:worker` | individually                                                            |
| `pnpm build`                       | `prisma generate && next build` (standalone output)                     |
| `pnpm start`                       | `next start`                                                            |
| `pnpm start:worker`                | `tsx src/worker/index.ts` (bundling can be added if image size matters) |
| `pnpm typecheck`                   | `next typegen && tsc --noEmit` (route types are generated first)        |
| `pnpm lint`                        | `eslint .` (incl. boundaries, i18n rules)                               |
| `pnpm format`                      | prettier                                                                |
| `pnpm db:migrate`                  | `prisma migrate dev`                                                    |
| `pnpm db:migrate:deploy`           | `prisma migrate deploy` (CI/prod)                                       |
| `pnpm db:generate`                 | `prisma generate`                                                       |
| `pnpm db:seed`                     | `tsx prisma/seed.ts`                                                    |
| `pnpm db:reset`                    | drop, migrate, seed (dev only)                                          |
| `pnpm db:studio`                   | Prisma Studio                                                           |
| `pnpm test`                        | `vitest run` (unit + integration; integration needs `postgres-test`)    |
| `pnpm test:unit`                   | `vitest run tests/unit`                                                 |
| `pnpm test:integration`            | `vitest run tests/integration`                                          |
| `pnpm test:e2e`                    | `playwright test` (starts web + worker against test DB)                 |
| `pnpm test:watch`                  |                                                                         |
| `pnpm check`                       | typecheck + lint + test + build — the "end of phase" gate               |
| `pnpm email:preview`               | react-email dev server for templates                                    |

---

## 6. Project bootstrap commands (Phase 1 reference)

Phase 1 was bootstrapped with `create-next-app@16` (`--ts --tailwind --eslint --app --src-dir`), `shadcn@latest init` (style `base-nova`, `@base-ui/react`), and `prisma init` (Prisma 7: `prisma.config.ts` holds the datasource URL and the seed command; the schema has no `url`). Later phases add packages as they are needed:

```bash
# Phase 2  auth
pnpm add better-auth
# Phase 7  booking UI
pnpm add react-day-picker
# Phase 10–11 notifications
pnpm add pg-boss resend nodemailer react-email @react-email/components web-push
pnpm add -D @types/nodemailer @types/web-push
# Phase 12 media
pnpm add sharp file-type @aws-sdk/client-s3 @dnd-kit/core @dnd-kit/sortable react-easy-crop
# Phase 13 analytics
pnpm add recharts
```

Notes that differ from older Next.js/Prisma versions:

- Next.js 16 renamed middleware to `src/proxy.ts`; route param types come from the generated `LayoutProps` / `PageProps` globals (`next typegen`).
- Prisma 7 generates a TypeScript client into `src/generated/prisma` (git-ignored, regenerated by `postinstall`) and requires a driver adapter (`@prisma/adapter-pg`).
- Every `DateTime` column is declared `@db.Timestamptz(3)`; Prisma's default would be a naive timestamp.
- `next-intl` decides the locale of `/` from `Accept-Language`, falling back to `bs`.

---

## 7. Docker images

`Dockerfile` (multi-stage):

```
base      node:22-alpine, pnpm via corepack
deps      pnpm install --frozen-lockfile (postinstall runs prisma generate)
builder   pnpm build (prisma generate + next build, output: 'standalone')
web       copies .next/standalone + .next/static + public; CMD ["node","server.js"]   EXPOSE 3000
worker    node_modules + src + generated client; CMD ["pnpm","start:worker"]          EXPOSE 3001
migrate   CMD ["pnpm","prisma","migrate","deploy"]  (one-off job image)
```

Build:

```bash
docker build --target web    -t salon-web .
docker build --target worker -t salon-worker .
docker build --target migrate -t salon-migrate .
```

`sharp` requires the alpine `vips` build; the Dockerfile installs `libc6-compat` and uses the prebuilt `sharp` binaries for `linuxmusl-x64`.

---

## 8. Deployment

### Target topology

```
[Cloudflare DNS/CDN] → [web ×N] ──┐
                                  ├── [PostgreSQL 16 managed]  (app schema + pgboss)
                       [worker ×1..N] ┘
                       [Cloudflare R2 bucket, public via custom domain]
                       [Resend]  [Sentry]  [PostHog (optional)]
```

### Railway (reference)

1. Create a project; add **PostgreSQL** plugin (enables `btree_gist` — verify with `CREATE EXTENSION`; Railway's Postgres image supports it).
2. Service **web**: Dockerfile target `web`, health check `/api/health`, env from §3 with production values (`EMAIL_PROVIDER=resend`, `STORAGE_PROVIDER=s3` with R2 credentials, `ERROR_TRACKER=sentry`).
3. Service **worker**: same repo, target `worker`, health check `:3001/health`, no public domain.
4. **Pre-deploy command** on web: `npx prisma migrate deploy` (or a `migrate` job service run before web/worker restart).
5. Custom domain → web. Cloudflare in front for TLS/CDN; R2 bucket bound to `media.<domain>`.

Fly.io and Hetzner + Coolify follow the same shape (two processes from one repo, managed or self-hosted Postgres, migrate on release). Vercel is also possible for `web` alone with the worker elsewhere; the code has no Vercel-specific dependency.

### Production checklist

- `BETTER_AUTH_SECRET`, VAPID keys, S3 keys, Resend key set as secrets.
- `APP_URL` and `BETTER_AUTH_URL` set to the public origin (CSRF and email links depend on it).
- Database: automated daily backups + PITR, `max_connections` sized for `web × DATABASE_POOL_MAX + worker`.
- Resend: verified sending domain, DKIM/SPF/DMARC.
- Sentry projects for web and worker; release tagging in CI.
- Uptime checks on `/api/health` and worker `/health`.
- Log retention on the platform.
- Rotate `BETTER_AUTH_SECRET` only with a session-invalidation announcement.

---

## 9. CI (GitHub Actions, `.github/workflows/ci.yml`)

```
services: postgres:16 (with btree_gist), minio, mailpit
steps:
  pnpm install --frozen-lockfile
  pnpm typecheck
  pnpm lint
  pnpm db:migrate:deploy   (test DB)
  pnpm test                (unit + integration, coverage upload)
  pnpm build
  pnpm test:e2e            (Playwright, chromium + mobile viewport)
  docker build (web, worker) on main → push to registry → deploy hook
```

---

## 10. Seed data

`prisma/seed.ts` is idempotent (upserts by slug/email) and creates:

- Super admin `admin@platform.local` (`SEED_SUPER_ADMIN_PASSWORD`)
- Salon owners/admins (password `SEED_OWNER_PASSWORD`): `owner@studio-example.local` (OWNER), `admin@studio-example.local` (ADMIN), `owner@barber-bros.local` (OWNER of Barber Bros)
- Salons **Studio Example** (`studio-example`, UNISEX, Mon–Fri 09:00–19:00, Sat 09:00–15:00) and **Barber Bros** (`barber-bros`, MALE, default hours), both with descriptions, addresses, contacts and default booking settings; the second salon exists to exercise tenant isolation and is the one E2E tests edit. Employees, services, customers and bookings are added by the seed in their respective phases.
- Salon **Studio Example** (`studio-example`), UNISEX, `Europe/Sarajevo`, `BAM`, Mon–Fri 09:00–19:00, Sat 09:00–15:00, Sun closed; settings: 30-min interval, 60-min notice, 60-day horizon, 12-h cancellation cutoff, auto-confirm on
- Owner `owner@studio-example.local`, admin `admin@studio-example.local`, employee login `marko@studio-example.local`
- Employees **Marko** (Mon, Tue, Fri 09:00–17:00; Thu 12:00–20:00; Sat 09:00–14:00; Wed off; lunch 13:00–13:30), **Ana** (Tue–Sat 10:00–18:00), **Sara** (Mon–Fri 09:00–15:00; vacation next Mon–Sun)
- Categories Hair, Beard; services Haircut 20 BAM/30 min, Beard Trim 10 BAM/15 min, Hair Styling 25 BAM/45 min, Hair Coloring 60 BAM/120 min; Marko provides all four, Ana all but Beard Trim, Sara Haircut + Styling
- 5 customers (`amina@example.com`, `emir@example.com` with accounts; 3 guests)
- ~30 bookings: past two weeks (COMPLETED, some NO_SHOW/CANCELLED) and next two weeks (CONFIRMED, a few PENDING), one blocked time for Marko, one salon closure
- A second salon **Barber Bros** (`barber-bros`, MALE) with one employee, to exercise tenant isolation in tests and demos

---

## 11. Troubleshooting

| Symptom                                   | Fix                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `extension "btree_gist" is not available` | Use the official `postgres:16` image or ask the provider to enable it; required for the booking exclusion constraint. |
| Emails not arriving in dev                | Check `EMAIL_PROVIDER=smtp` and Mailpit at :8025; worker must be running (`pnpm dev` starts it).                      |
| Push permission prompt never appears      | Needs HTTPS or `localhost`; check `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.                                                     |
| Images 403                                | MinIO bucket policy must be public-read for `salon-media` (set by `minio-init`), or `S3_PUBLIC_BASE_URL` wrong.       |
| Reminders not sent                        | Worker down or `reminder24hEnabled` off; check Platform → Jobs and `booking_reminders.status`.                        |
