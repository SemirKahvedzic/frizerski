import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit";
import { diffSnapshots } from "@/modules/audit/diff";
import { authorize } from "@/modules/auth/authorize";
import type { CategoryInput, ServiceInput } from "@/modules/services/schemas";
import type { TenantContext } from "@/modules/tenant/context";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type Category = { id: string; name: string; sortOrder: number; serviceCount: number };

export type ServiceSummary = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  audience: "MALE" | "FEMALE" | "UNISEX";
  isActive: boolean;
  sortOrder: number;
  employeeIds: string[];
};

const serviceSelect = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  priceCents: true,
  currency: true,
  durationMinutes: true,
  bufferAfterMinutes: true,
  audience: true,
  isActive: true,
  sortOrder: true,
  employees: { select: { employeeId: true } },
} as const;

type ServiceRow = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  audience: "MALE" | "FEMALE" | "UNISEX";
  isActive: boolean;
  sortOrder: number;
  employees: { employeeId: string }[];
};

function toSummary(row: ServiceRow): ServiceSummary {
  const { employees, ...rest } = row;
  return { ...rest, employeeIds: employees.map((e) => e.employeeId) };
}

const SERVICE_KEYS = [
  "name",
  "description",
  "categoryId",
  "priceCents",
  "durationMinutes",
  "bufferAfterMinutes",
  "audience",
  "isActive",
] as const;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(ctx: TenantContext): Promise<Category[]> {
  const rows = await ctx.db.serviceCategory.findMany({
    where: { salonId: ctx.salonId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, sortOrder: true, _count: { select: { services: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sortOrder,
    serviceCount: r._count.services,
  }));
}

export async function createCategory(ctx: TenantContext, input: CategoryInput): Promise<Category> {
  authorize(ctx.actor, "service.manage", { salonId: ctx.salonId });
  const existing = await ctx.db.serviceCategory.findFirst({
    where: { salonId: ctx.salonId, name: input.name },
  });
  if (existing)
    throw new ConflictError("A category with this name already exists.", { field: "name" });
  const last = await ctx.db.serviceCategory.aggregate({
    where: { salonId: ctx.salonId },
    _max: { sortOrder: true },
  });

  return prisma.$transaction(async (tx) => {
    const row = await tx.serviceCategory.create({
      data: { salonId: ctx.salonId, name: input.name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "serviceCategory.created",
      entityType: "ServiceCategory",
      entityId: row.id,
      after: { name: row.name },
      request: ctx.request,
    });
    return { id: row.id, name: row.name, sortOrder: row.sortOrder, serviceCount: 0 };
  });
}

export async function renameCategory(
  ctx: TenantContext,
  categoryId: string,
  input: CategoryInput,
): Promise<void> {
  authorize(ctx.actor, "service.manage", { salonId: ctx.salonId });
  const existing = await ctx.db.serviceCategory.findUnique({ where: { id: categoryId } });
  if (!existing) throw new NotFoundError("Category");
  await prisma.$transaction(async (tx) => {
    await tx.serviceCategory.update({
      where: { id: categoryId, salonId: ctx.salonId },
      data: { name: input.name },
    });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "serviceCategory.renamed",
      entityType: "ServiceCategory",
      entityId: categoryId,
      before: { name: existing.name },
      after: { name: input.name },
      request: ctx.request,
    });
  });
}

/** Deleting a category keeps its services (they become uncategorized). */
export async function deleteCategory(ctx: TenantContext, categoryId: string): Promise<void> {
  authorize(ctx.actor, "service.manage", { salonId: ctx.salonId });
  const existing = await ctx.db.serviceCategory.findUnique({ where: { id: categoryId } });
  if (!existing) throw new NotFoundError("Category");
  await prisma.$transaction(async (tx) => {
    await tx.serviceCategory.delete({ where: { id: categoryId, salonId: ctx.salonId } });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "serviceCategory.deleted",
      entityType: "ServiceCategory",
      entityId: categoryId,
      before: { name: existing.name },
      request: ctx.request,
    });
  });
}

export async function reorderCategories(ctx: TenantContext, ids: string[]): Promise<void> {
  authorize(ctx.actor, "service.manage", { salonId: ctx.salonId });
  const existing = await ctx.db.serviceCategory.findMany({
    where: { salonId: ctx.salonId },
    select: { id: true },
  });
  assertSameSet(
    ids,
    existing.map((e) => e.id),
  );
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.serviceCategory.update({
        where: { id, salonId: ctx.salonId },
        data: { sortOrder: index },
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function listServices(
  ctx: TenantContext,
  options: { includeInactive?: boolean } = {},
): Promise<ServiceSummary[]> {
  const rows = await ctx.db.service.findMany({
    where: { salonId: ctx.salonId, ...(options.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: serviceSelect,
  });
  return rows.map(toSummary);
}

export async function getService(ctx: TenantContext, serviceId: string): Promise<ServiceSummary> {
  const row = await ctx.db.service.findUnique({ where: { id: serviceId }, select: serviceSelect });
  if (!row) throw new NotFoundError("Service");
  return toSummary(row);
}

async function assertEmployeesBelong(ctx: TenantContext, employeeIds: string[]): Promise<void> {
  if (employeeIds.length === 0) return;
  const count = await ctx.db.employee.count({
    where: { salonId: ctx.salonId, id: { in: employeeIds } },
  });
  if (count !== new Set(employeeIds).size)
    throw new ValidationError("Unknown employee.", { field: "employeeIds" });
}

async function assertCategoryBelongs(ctx: TenantContext, categoryId: string | null): Promise<void> {
  if (!categoryId) return;
  const exists = await ctx.db.serviceCategory.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!exists) throw new ValidationError("Unknown category.", { field: "categoryId" });
}

export async function createService(
  ctx: TenantContext,
  input: ServiceInput,
): Promise<ServiceSummary> {
  authorize(ctx.actor, "service.manage", { salonId: ctx.salonId });
  await Promise.all([
    assertEmployeesBelong(ctx, input.employeeIds),
    assertCategoryBelongs(ctx, input.categoryId),
  ]);
  const [salon, last] = await Promise.all([
    ctx.db.salon.findUniqueOrThrow({ where: { id: ctx.salonId }, select: { currency: true } }),
    ctx.db.service.aggregate({ where: { salonId: ctx.salonId }, _max: { sortOrder: true } }),
  ]);

  return prisma.$transaction(async (tx) => {
    const created = await tx.service.create({
      data: {
        salonId: ctx.salonId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents,
        currency: salon.currency,
        durationMinutes: input.durationMinutes,
        bufferAfterMinutes: input.bufferAfterMinutes,
        audience: input.audience,
        isActive: input.isActive,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    if (input.employeeIds.length > 0) {
      await tx.employeeService.createMany({
        data: input.employeeIds.map((employeeId) => ({
          salonId: ctx.salonId,
          serviceId: created.id,
          employeeId,
        })),
      });
    }
    const row = await tx.service.findUniqueOrThrow({
      where: { id: created.id },
      select: serviceSelect,
    });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "service.created",
      entityType: "Service",
      entityId: row.id,
      after: {
        name: row.name,
        priceCents: row.priceCents,
        durationMinutes: row.durationMinutes,
        employeeIds: input.employeeIds,
      },
      request: ctx.request,
    });
    return toSummary(row);
  });
}

export async function updateService(
  ctx: TenantContext,
  serviceId: string,
  input: ServiceInput,
): Promise<ServiceSummary> {
  authorize(ctx.actor, "service.manage", { salonId: ctx.salonId });
  const before = await getService(ctx, serviceId);
  await Promise.all([
    assertEmployeesBelong(ctx, input.employeeIds),
    assertCategoryBelongs(ctx, input.categoryId),
  ]);

  return prisma.$transaction(async (tx) => {
    await tx.employeeService.deleteMany({
      where: { salonId: ctx.salonId, serviceId, employeeId: { notIn: input.employeeIds } },
    });
    const current = new Set(before.employeeIds);
    const added = input.employeeIds.filter((id) => !current.has(id));
    if (added.length > 0) {
      await tx.employeeService.createMany({
        data: added.map((employeeId) => ({ salonId: ctx.salonId, serviceId, employeeId })),
      });
    }
    const row = await tx.service.update({
      where: { id: serviceId, salonId: ctx.salonId },
      data: {
        categoryId: input.categoryId,
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents,
        durationMinutes: input.durationMinutes,
        bufferAfterMinutes: input.bufferAfterMinutes,
        audience: input.audience,
        isActive: input.isActive,
      },
      select: serviceSelect,
    });
    const after = toSummary(row);
    const diff = diffSnapshots(before, after, SERVICE_KEYS);
    const employeesChanged =
      [...before.employeeIds].sort().join() !== [...after.employeeIds].sort().join();
    if (diff.changed.length > 0 || employeesChanged) {
      const priceChanged = diff.changed.includes("priceCents");
      await recordAudit(tx, {
        salonId: ctx.salonId,
        actor: ctx.actor,
        action: priceChanged ? "service.priceChanged" : "service.updated",
        entityType: "Service",
        entityId: serviceId,
        before: {
          ...diff.before,
          ...(employeesChanged ? { employeeIds: before.employeeIds } : {}),
        },
        after: { ...diff.after, ...(employeesChanged ? { employeeIds: after.employeeIds } : {}) },
        request: ctx.request,
      });
    }
    return after;
  });
}

export async function setServiceActive(
  ctx: TenantContext,
  serviceId: string,
  isActive: boolean,
): Promise<void> {
  authorize(ctx.actor, "service.manage", { salonId: ctx.salonId });
  const before = await getService(ctx, serviceId);
  if (before.isActive === isActive) return;
  await prisma.$transaction(async (tx) => {
    await tx.service.update({ where: { id: serviceId, salonId: ctx.salonId }, data: { isActive } });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: isActive ? "service.activated" : "service.deactivated",
      entityType: "Service",
      entityId: serviceId,
      before: { isActive: before.isActive },
      after: { isActive },
      request: ctx.request,
    });
  });
}

/** Hard delete; refused once bookings reference the service (booking phase). */
export async function deleteService(ctx: TenantContext, serviceId: string): Promise<void> {
  authorize(ctx.actor, "service.manage", { salonId: ctx.salonId });
  const before = await getService(ctx, serviceId);
  await prisma.$transaction(async (tx) => {
    await tx.service.delete({ where: { id: serviceId, salonId: ctx.salonId } });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "service.deleted",
      entityType: "Service",
      entityId: serviceId,
      before: { name: before.name, priceCents: before.priceCents },
      request: ctx.request,
    });
  });
}

export async function reorderServices(ctx: TenantContext, ids: string[]): Promise<void> {
  authorize(ctx.actor, "service.manage", { salonId: ctx.salonId });
  const existing = await ctx.db.service.findMany({
    where: { salonId: ctx.salonId },
    select: { id: true },
  });
  assertSameSet(
    ids,
    existing.map((e) => e.id),
  );
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.service.update({ where: { id, salonId: ctx.salonId }, data: { sortOrder: index } }),
    ),
  );
}

/** Services an employee provides; used by the employee page and the booking engine. */
export async function listServicesForEmployee(
  ctx: TenantContext,
  employeeId: string,
): Promise<ServiceSummary[]> {
  const rows = await ctx.db.service.findMany({
    where: { salonId: ctx.salonId, isActive: true, employees: { some: { employeeId } } },
    orderBy: [{ sortOrder: "asc" }],
    select: serviceSelect,
  });
  return rows.map(toSummary);
}

function assertSameSet(ids: string[], existing: string[]): void {
  const known = new Set(existing);
  if (
    ids.length !== known.size ||
    !ids.every((id) => known.has(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new ValidationError("Reorder must include every item exactly once.");
  }
}
