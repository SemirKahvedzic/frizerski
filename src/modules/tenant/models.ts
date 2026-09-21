/**
 * Models that carry a `salonId` column and must always be queried through the
 * tenant-scoped client. `tests/unit/tenant-models.test.ts` parses
 * `prisma/schema.prisma` and fails when a model with `salonId` is missing here.
 */
export const TENANT_MODELS = ["SalonMembership", "AuditLog"] as const;

export type TenantModel = (typeof TENANT_MODELS)[number];

const tenantModelSet: ReadonlySet<string> = new Set(TENANT_MODELS);

export function isTenantModel(model: string): model is TenantModel {
  return tenantModelSet.has(model);
}

/** The tenant root: scoped by `id`, never created or deleted through a tenant client. */
export const TENANT_ROOT_MODEL = "Salon";
