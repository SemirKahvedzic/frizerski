import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Prisma client singleton (Prisma 7 with the `pg` driver adapter).
 *
 * Created lazily so that importing this module never opens connections at
 * build time. In development the instance is cached on `globalThis` to
 * survive hot reloads. Tenant-scoped access is layered on top of this raw
 * client by `modules/tenant` (docs/architecture.md §6); repositories must
 * not use the raw client for tenant models.
 */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
  });

  const client = new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "warn" },
            { emit: "event", level: "error" },
          ]
        : [{ emit: "event", level: "error" }],
  });

  client.$on("error", (event) => logger.error({ target: event.target }, event.message));
  client.$on("warn", (event) => logger.warn({ target: event.target }, event.message));

  return client;
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createPrismaClient();
  }
  return globalForPrisma.__prisma;
}

/** Lazy accessor: `prisma.user.findMany()` creates the client on first use. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

export async function disconnectPrisma(): Promise<void> {
  if (globalForPrisma.__prisma) {
    await globalForPrisma.__prisma.$disconnect();
    globalForPrisma.__prisma = undefined;
  }
}

/** Cheap connectivity probe used by health endpoints. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ err: error }, "Database ping failed");
    return false;
  }
}
