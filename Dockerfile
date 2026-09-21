# syntax=docker/dockerfile:1.7
# Multi-stage build producing three images from one repository:
#   --target web      Next.js standalone server        (port 3000)
#   --target worker   background jobs process          (health on 3001)
#   --target migrate  one-off `prisma migrate deploy`
# See docs/setup.md §7.

ARG NODE_IMAGE=node:22-alpine

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    CI=true

# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS web
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]

# ---------------------------------------------------------------------------
FROM base AS worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/generated ./src/generated
COPY package.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY messages ./messages
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["pnpm", "start:worker"]

# ---------------------------------------------------------------------------
FROM base AS migrate
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
CMD ["pnpm", "prisma", "migrate", "deploy"]
