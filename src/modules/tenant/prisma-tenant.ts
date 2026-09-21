import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { scopeArgs } from "@/modules/tenant/scope";

/**
 * Tenant-scoped Prisma client (docs/architecture.md §6, layer 2).
 *
 * Every operation on a tenant model automatically receives `salonId` in its
 * `where`/`data`; the `Salon` root is pinned to `id = salonId`; any other model
 * throws so cross-tenant access cannot happen by accident. Repositories only
 * ever receive this client.
 */
export function createTenantDb(base: PrismaClient, salonId: string) {
  return base.$extends({
    name: `tenant:${salonId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scoped = scopeArgs(model, operation, args, salonId);
          return query(scoped as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantDb>;

const cache = new Map<string, TenantDb>();

/** Memoized per salon so request handlers do not rebuild the extension each time. */
export function tenantDb(salonId: string): TenantDb {
  let db = cache.get(salonId);
  if (!db) {
    db = createTenantDb(getPrisma(), salonId);
    if (cache.size > 500) cache.clear();
    cache.set(salonId, db);
  }
  return db;
}

/** Test helper. */
export function resetTenantDbCache(): void {
  cache.clear();
}
