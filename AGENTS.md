<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions

Read `docs/README.md` first; `docs/architecture.md` is the source of truth for structure and decisions.

- Business logic lives in `src/modules/*`; `src/app` and `src/worker` are adapters. ESLint enforces the import boundaries listed in `docs/architecture.md` §4.
- Every API route is declared with `defineRoute` (`src/lib/api/define-route.ts`); every thrown error is an `AppError` subclass (`src/lib/errors.ts`).
- Read configuration through `src/lib/env.ts` only; never `process.env` in application code.
- Database access goes through `src/lib/db.ts`; tenant-owned models must use the tenant-scoped client once it exists (`src/modules/tenant`).
- All `DateTime` columns are `@db.Timestamptz(3)`; schedules use `"HH:mm"` strings interpreted in the salon timezone.
- No user-facing literal strings in components; add keys to `messages/bs.json` and `messages/en.json`.
- End of every phase: `pnpm check` (typecheck, lint, tests, build) and `pnpm test:e2e` must pass, and docs must be updated.
