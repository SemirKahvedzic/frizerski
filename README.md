# Salon Booking SaaS

Multi-tenant web application for hair salons: salon profiles, staff and schedules, services and price lists, online booking with conflict-free slot allocation, admin calendar, client dashboard, email and push reminders.

## Documentation

Start with [docs/README.md](./docs/README.md). Architecture, database schema, API, booking engine, notifications, setup and testing are documented there.

## Quick start

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000
- Health: http://localhost:3000/api/health
- Worker health: http://localhost:3001/health
- Mailpit: http://localhost:8025
- MinIO console: http://localhost:9001

## Scripts

| Script            | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `pnpm dev`        | web + worker with hot reload                                 |
| `pnpm check`      | typecheck, lint, tests, build (phase gate)                   |
| `pnpm test`       | unit + integration tests (integration needs `postgres-test`) |
| `pnpm test:e2e`   | Playwright end-to-end tests                                  |
| `pnpm db:migrate` | create/apply migrations in development                       |

## Status

Phase 1 (project foundation) in progress. Roadmap: [docs/architecture.md §15](./docs/architecture.md#15-development-roadmap).
