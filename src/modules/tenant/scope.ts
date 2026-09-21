import { AppError } from "@/lib/errors";
import { TENANT_ROOT_MODEL, isTenantModel } from "@/modules/tenant/models";

/**
 * Pure argument rewriting for the tenant-scoped Prisma client. Kept free of
 * Prisma imports so it can be unit-tested exhaustively.
 */
export class TenantScopeError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("INTERNAL_ERROR", message, 500, { details, expose: false });
  }
}

type Args = Record<string, unknown>;

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

const FORBIDDEN_ON_ROOT = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "delete",
  "deleteMany",
  "updateMany",
  "upsert",
]);

function asArgs(value: unknown): Args {
  return (value ?? {}) as Args;
}

function assertSameTenant(model: string, field: string, present: unknown, salonId: string): void {
  if (present !== undefined && present !== salonId) {
    throw new TenantScopeError(`Cross-tenant ${field} on ${model} rejected.`, {
      model,
      field,
      expected: salonId,
      received: present,
    });
  }
}

function scopeWhere(model: string, where: unknown, salonId: string): Args {
  const w = asArgs(where);
  assertSameTenant(model, "where.salonId", w["salonId"], salonId);
  return { ...w, salonId };
}

function scopeData(model: string, data: unknown, salonId: string): Args {
  const d = asArgs(data);
  assertSameTenant(model, "data.salonId", d["salonId"], salonId);
  if (d["salon"] !== undefined) {
    throw new TenantScopeError(`Use salonId instead of a salon relation on ${model}.`, { model });
  }
  return { ...d, salonId };
}

/**
 * Rewrites Prisma call arguments so that every read and write is confined to
 * `salonId`. Throws `TenantScopeError` on any attempt to address another
 * tenant explicitly.
 */
export function scopeArgs(
  model: string,
  operation: string,
  rawArgs: unknown,
  salonId: string,
): Args {
  const args = asArgs(rawArgs);

  if (model === TENANT_ROOT_MODEL) {
    if (FORBIDDEN_ON_ROOT.has(operation)) {
      throw new TenantScopeError(
        `Operation ${operation} on ${model} is not allowed through a tenant client.`,
        {
          model,
          operation,
        },
      );
    }
    if (WHERE_OPERATIONS.has(operation)) {
      const where = asArgs(args["where"]);
      assertSameTenant(model, "where.id", where["id"], salonId);
      return { ...args, where: { ...where, id: salonId } };
    }
    return args;
  }

  if (!isTenantModel(model)) {
    throw new TenantScopeError(
      `Model ${model} is not tenant-scoped; query it through the platform client explicitly.`,
      { model, operation },
    );
  }

  switch (operation) {
    case "create":
      return { ...args, data: scopeData(model, args["data"], salonId) };
    case "createMany":
    case "createManyAndReturn": {
      const data = args["data"];
      const rows = Array.isArray(data) ? data : [data];
      return { ...args, data: rows.map((row) => scopeData(model, row, salonId)) };
    }
    case "upsert":
      return {
        ...args,
        where: scopeWhere(model, args["where"], salonId),
        create: scopeData(model, args["create"], salonId),
        update: (() => {
          const u = asArgs(args["update"]);
          assertSameTenant(model, "update.salonId", u["salonId"], salonId);
          return u;
        })(),
      };
    case "update":
    case "updateMany": {
      const d = asArgs(args["data"]);
      assertSameTenant(model, "data.salonId", d["salonId"], salonId);
      return { ...args, where: scopeWhere(model, args["where"], salonId) };
    }
    default:
      if (WHERE_OPERATIONS.has(operation)) {
        return { ...args, where: scopeWhere(model, args["where"], salonId) };
      }
      // Unknown/raw operations are not permitted on tenant models.
      throw new TenantScopeError(
        `Operation ${operation} on ${model} is not supported by the tenant client.`,
        {
          model,
          operation,
        },
      );
  }
}
