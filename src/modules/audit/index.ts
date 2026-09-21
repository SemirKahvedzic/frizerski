import type { Prisma } from "@/generated/prisma/client";
import type { Principal } from "@/modules/auth/types";
import type { RequestMeta } from "@/modules/tenant/context";

/**
 * Audit log writer (docs/architecture.md §8). Called from services inside the
 * same transaction as the change so the log can never disagree with the data.
 * `before`/`after` must be whitelisted snapshots: never pass password hashes,
 * tokens or whole rows blindly.
 */
export type AuditSnapshot = Record<string, Prisma.InputJsonValue | null>;

export type AuditEntry = {
  salonId: string | null;
  actor: Principal | "SYSTEM";
  action: string;
  entityType: string;
  entityId: string;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
  metadata?: AuditSnapshot;
  request?: RequestMeta;
};

/** Structural type satisfied by the raw client, the tenant client and transactions. */
export type AuditWriter = {
  auditLog: {
    create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown>;
  };
};

function toJson(value: AuditSnapshot | null | undefined): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  return value as Prisma.InputJsonValue;
}

export async function recordAudit(db: AuditWriter, entry: AuditEntry): Promise<void> {
  const actorUserId =
    entry.actor !== "SYSTEM" && entry.actor.kind === "user" ? entry.actor.userId : null;
  const actorType =
    entry.actor === "SYSTEM" ? "SYSTEM" : entry.actor.kind === "user" ? "USER" : "GUEST";

  await db.auditLog.create({
    data: {
      salonId: entry.salonId,
      actorUserId,
      actorType,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
      metadata: toJson(entry.metadata),
      ipAddress: entry.request?.ip,
      userAgent: entry.request?.userAgent,
      requestId: entry.request?.requestId,
    },
  });
}
