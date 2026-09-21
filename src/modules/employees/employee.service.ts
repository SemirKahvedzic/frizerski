import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { compareTimes, dateStringToUtc, utcToDateString, wallClockToUtc } from "@/lib/time";
import { recordAudit } from "@/modules/audit";
import { diffSnapshots } from "@/modules/audit/diff";
import { authorize } from "@/modules/auth/authorize";
import type {
  BlockedTimeInput,
  EmployeeInput,
  ScheduleInput,
  TimeOffInput,
} from "@/modules/employees/schemas";
import { sendEmployeeInviteEmail } from "@/modules/notifications";
import type { TenantContext } from "@/modules/tenant/context";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type EmployeeSummary = {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  audience: "MALE" | "FEMALE" | "UNISEX";
  color: string | null;
  isActive: boolean;
  isBookableOnline: boolean;
  sortOrder: number;
  userId: string | null;
};

const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  position: true,
  bio: true,
  email: true,
  phone: true,
  audience: true,
  color: true,
  isActive: true,
  isBookableOnline: true,
  sortOrder: true,
  userId: true,
} as const;

const EMPLOYEE_KEYS = [
  "firstName",
  "lastName",
  "position",
  "bio",
  "email",
  "phone",
  "audience",
  "color",
  "isActive",
  "isBookableOnline",
] as const;

export type ScheduleBlock = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  breaks: { id: string; startTime: string; endTime: string; label: string | null }[];
};

export type TimeOff = {
  id: string;
  employeeId: string;
  type: "VACATION" | "SICK" | "PERSONAL" | "OTHER";
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  reason: string | null;
};

export type BlockedTime = {
  id: string;
  employeeId: string | null;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
};

async function salonTimezone(ctx: TenantContext): Promise<string> {
  const salon = await ctx.db.salon.findUniqueOrThrow({
    where: { id: ctx.salonId },
    select: { timezone: true },
  });
  return salon.timezone;
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function listEmployees(
  ctx: TenantContext,
  options: { includeInactive?: boolean } = {},
): Promise<EmployeeSummary[]> {
  return ctx.db.employee.findMany({
    where: { salonId: ctx.salonId, ...(options.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { firstName: "asc" }],
    select: employeeSelect,
  });
}

export async function getEmployee(
  ctx: TenantContext,
  employeeId: string,
): Promise<EmployeeSummary> {
  const employee = await ctx.db.employee.findUnique({
    where: { id: employeeId },
    select: employeeSelect,
  });
  if (!employee) throw new NotFoundError("Employee");
  return employee;
}

export async function createEmployee(
  ctx: TenantContext,
  input: EmployeeInput,
): Promise<EmployeeSummary> {
  authorize(ctx.actor, "employee.manage", { salonId: ctx.salonId });
  const last = await ctx.db.employee.aggregate({
    where: { salonId: ctx.salonId },
    _max: { sortOrder: true },
  });

  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        salonId: ctx.salonId,
        firstName: input.firstName,
        lastName: input.lastName,
        position: input.position ?? null,
        bio: input.bio ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        audience: input.audience,
        color: input.color ?? null,
        isActive: input.isActive,
        isBookableOnline: input.isBookableOnline,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
      select: employeeSelect,
    });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "employee.created",
      entityType: "Employee",
      entityId: employee.id,
      after: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        position: employee.position,
      },
      request: ctx.request,
    });
    return employee;
  });
}

export async function updateEmployee(
  ctx: TenantContext,
  employeeId: string,
  input: EmployeeInput,
): Promise<EmployeeSummary> {
  authorize(ctx.actor, "employee.manage", { salonId: ctx.salonId });
  const before = await getEmployee(ctx, employeeId);

  return prisma.$transaction(async (tx) => {
    const after = await tx.employee.update({
      where: { id: employeeId, salonId: ctx.salonId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        position: input.position ?? null,
        bio: input.bio ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        audience: input.audience,
        color: input.color ?? null,
        isActive: input.isActive,
        isBookableOnline: input.isBookableOnline,
      },
      select: employeeSelect,
    });
    const diff = diffSnapshots(before, after, EMPLOYEE_KEYS);
    if (diff.changed.length > 0) {
      await recordAudit(tx, {
        salonId: ctx.salonId,
        actor: ctx.actor,
        action: "employee.updated",
        entityType: "Employee",
        entityId: employeeId,
        before: diff.before,
        after: diff.after,
        request: ctx.request,
      });
    }
    return after;
  });
}

export async function reorderEmployees(ctx: TenantContext, ids: string[]): Promise<void> {
  authorize(ctx.actor, "employee.manage", { salonId: ctx.salonId });
  const existing = await ctx.db.employee.findMany({
    where: { salonId: ctx.salonId },
    select: { id: true },
  });
  const known = new Set(existing.map((e) => e.id));
  if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
    throw new ValidationError("Reorder must include every employee exactly once.");
  }
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.employee.update({ where: { id, salonId: ctx.salonId }, data: { sortOrder: index } }),
    ),
  );
}

/**
 * Deletes an employee. Refused once the employee has bookings (added in the
 * booking phase); until then a hard delete cascades schedules and time off.
 */
export async function deleteEmployee(ctx: TenantContext, employeeId: string): Promise<void> {
  authorize(ctx.actor, "employee.manage", { salonId: ctx.salonId });
  const employee = await getEmployee(ctx, employeeId);
  await prisma.$transaction(async (tx) => {
    await tx.salonMembership.updateMany({
      where: { salonId: ctx.salonId, employeeId },
      data: { employeeId: null },
    });
    await tx.employee.delete({ where: { id: employeeId, salonId: ctx.salonId } });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "employee.deleted",
      entityType: "Employee",
      entityId: employeeId,
      before: { firstName: employee.firstName, lastName: employee.lastName },
      request: ctx.request,
    });
  });
}

// ---------------------------------------------------------------------------
// Access (link a user account)
// ---------------------------------------------------------------------------

/**
 * Links an existing user account (by email) to the employee as an EMPLOYEE
 * member, or re-sends an invitation when no account exists yet. Users who
 * already hold OWNER/ADMIN keep their role; only the employee link is set.
 */
export async function inviteEmployeeUser(
  ctx: TenantContext,
  employeeId: string,
  email: string,
  options: { registerUrl: string },
): Promise<{ linked: boolean }> {
  authorize(ctx.actor, "membership.manage", { salonId: ctx.salonId });
  const employee = await getEmployee(ctx, employeeId);
  const salon = await ctx.db.salon.findUniqueOrThrow({
    where: { id: ctx.salonId },
    select: { name: true, defaultLocale: true },
  });
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, locale: true },
  });

  if (!user) {
    await sendEmployeeInviteEmail({
      to: email,
      name: `${employee.firstName} ${employee.lastName}`,
      locale: salon.defaultLocale,
      salonName: salon.name,
      url: options.registerUrl,
    });
    await recordAudit(prisma, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "employee.invited",
      entityType: "Employee",
      entityId: employeeId,
      metadata: { email },
      request: ctx.request,
    });
    return { linked: false };
  }

  const otherLink = await ctx.db.employee.findFirst({
    where: { salonId: ctx.salonId, userId: user.id, NOT: { id: employeeId } },
    select: { id: true },
  });
  if (otherLink) throw new ConflictError("This account is already linked to another employee.");

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employeeId, salonId: ctx.salonId },
      data: { userId: user.id },
    });
    const membership = await tx.salonMembership.findUnique({
      where: { userId_salonId: { userId: user.id, salonId: ctx.salonId } },
    });
    if (membership) {
      await tx.salonMembership.update({ where: { id: membership.id }, data: { employeeId } });
    } else {
      await tx.salonMembership.create({
        data: {
          userId: user.id,
          salonId: ctx.salonId,
          role: "EMPLOYEE",
          employeeId,
          invitedById: ctx.actor.userId,
        },
      });
    }
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "employee.userLinked",
      entityType: "Employee",
      entityId: employeeId,
      after: { userId: user.id, email },
      request: ctx.request,
    });
  });
  return { linked: true };
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export async function getSchedule(
  ctx: TenantContext,
  employeeId: string,
): Promise<ScheduleBlock[]> {
  const rows = await ctx.db.employeeSchedule.findMany({
    where: { salonId: ctx.salonId, employeeId, validFrom: null, validUntil: null },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      weekday: true,
      startTime: true,
      endTime: true,
      breaks: {
        orderBy: { startTime: "asc" },
        select: { id: true, startTime: true, endTime: true, label: true },
      },
    },
  });
  return rows;
}

/** Replaces the current (open-ended) weekly schedule. */
export async function setSchedule(
  ctx: TenantContext,
  employeeId: string,
  blocks: ScheduleInput,
): Promise<ScheduleBlock[]> {
  authorize(ctx.actor, "employee.manage", { salonId: ctx.salonId });
  await getEmployee(ctx, employeeId);
  const before = await getSchedule(ctx, employeeId);

  await prisma.$transaction(async (tx) => {
    await tx.employeeSchedule.deleteMany({
      where: { salonId: ctx.salonId, employeeId, validFrom: null, validUntil: null },
    });
    for (const block of [...blocks].sort(
      (a, b) => a.weekday - b.weekday || compareTimes(a.startTime, b.startTime),
    )) {
      await tx.employeeSchedule.create({
        data: {
          salonId: ctx.salonId,
          employeeId,
          weekday: block.weekday,
          startTime: block.startTime,
          endTime: block.endTime,
          breaks: {
            create: block.breaks.map((b) => ({
              startTime: b.startTime,
              endTime: b.endTime,
              label: b.label ?? null,
            })),
          },
        },
      });
    }
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "employee.scheduleUpdated",
      entityType: "Employee",
      entityId: employeeId,
      before: { blocks: before.map((b) => `${b.weekday}:${b.startTime}-${b.endTime}`) },
      after: { blocks: blocks.map((b) => `${b.weekday}:${b.startTime}-${b.endTime}`) },
      request: ctx.request,
    });
  });

  return getSchedule(ctx, employeeId);
}

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

export async function listTimeOff(
  ctx: TenantContext,
  options: { employeeId?: string; from?: Date } = {},
): Promise<TimeOff[]> {
  return ctx.db.employeeTimeOff.findMany({
    where: {
      salonId: ctx.salonId,
      ...(options.employeeId ? { employeeId: options.employeeId } : {}),
      ...(options.from ? { endsAt: { gt: options.from } } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      employeeId: true,
      type: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      reason: true,
    },
  });
}

export async function addTimeOff(
  ctx: TenantContext,
  employeeId: string,
  input: TimeOffInput,
): Promise<TimeOff> {
  authorize(ctx.actor, "employee.manage", { salonId: ctx.salonId });
  await getEmployee(ctx, employeeId);
  const tz = await salonTimezone(ctx);

  const startsAt = input.allDay
    ? wallClockToUtc(input.startsOn, "00:00", tz)
    : wallClockToUtc(input.startsOn, input.startTime ?? "00:00", tz);
  const endsAt = input.allDay
    ? wallClockToUtc(
        utcToDateString(new Date(dateStringToUtc(input.endsOn).getTime() + 86_400_000)),
        "00:00",
        tz,
      )
    : wallClockToUtc(input.endsOn, input.endTime ?? "24:00", tz);

  return prisma.$transaction(async (tx) => {
    const row = await tx.employeeTimeOff.create({
      data: {
        salonId: ctx.salonId,
        employeeId,
        type: input.type,
        startsAt,
        endsAt,
        allDay: input.allDay,
        reason: input.reason ?? null,
        createdById: ctx.actor.userId,
      },
      select: {
        id: true,
        employeeId: true,
        type: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
        reason: true,
      },
    });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "employee.timeOffAdded",
      entityType: "EmployeeTimeOff",
      entityId: row.id,
      after: {
        employeeId,
        type: row.type,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
      },
      request: ctx.request,
    });
    return row;
  });
}

export async function removeTimeOff(ctx: TenantContext, timeOffId: string): Promise<void> {
  authorize(ctx.actor, "employee.manage", { salonId: ctx.salonId });
  const existing = await ctx.db.employeeTimeOff.findUnique({ where: { id: timeOffId } });
  if (!existing) throw new NotFoundError("Time off");
  await prisma.$transaction(async (tx) => {
    await tx.employeeTimeOff.delete({ where: { id: timeOffId, salonId: ctx.salonId } });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "employee.timeOffRemoved",
      entityType: "EmployeeTimeOff",
      entityId: timeOffId,
      before: {
        employeeId: existing.employeeId,
        startsAt: existing.startsAt.toISOString(),
        endsAt: existing.endsAt.toISOString(),
      },
      request: ctx.request,
    });
  });
}

// ---------------------------------------------------------------------------
// Blocked times
// ---------------------------------------------------------------------------

export async function listBlockedTimes(
  ctx: TenantContext,
  options: { employeeId?: string | null; from?: Date; to?: Date } = {},
): Promise<BlockedTime[]> {
  return ctx.db.blockedTime.findMany({
    where: {
      salonId: ctx.salonId,
      ...(options.employeeId === undefined ? {} : { employeeId: options.employeeId }),
      ...(options.from ? { endsAt: { gt: options.from } } : {}),
      ...(options.to ? { startsAt: { lt: options.to } } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, employeeId: true, startsAt: true, endsAt: true, reason: true },
  });
}

export async function addBlockedTime(
  ctx: TenantContext,
  input: BlockedTimeInput,
): Promise<BlockedTime> {
  authorize(ctx.actor, "employee.manage", { salonId: ctx.salonId });
  const employeeId = input.employeeId && input.employeeId.length > 0 ? input.employeeId : null;
  if (employeeId) await getEmployee(ctx, employeeId);
  const tz = await salonTimezone(ctx);
  const startsAt = wallClockToUtc(input.date, input.startTime, tz);
  const endsAt = wallClockToUtc(input.date, input.endTime, tz);

  return prisma.$transaction(async (tx) => {
    const row = await tx.blockedTime.create({
      data: {
        salonId: ctx.salonId,
        employeeId,
        startsAt,
        endsAt,
        reason: input.reason ?? null,
        createdById: ctx.actor.userId,
      },
      select: { id: true, employeeId: true, startsAt: true, endsAt: true, reason: true },
    });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "blockedTime.added",
      entityType: "BlockedTime",
      entityId: row.id,
      after: {
        employeeId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: row.reason,
      },
      request: ctx.request,
    });
    return row;
  });
}

export async function removeBlockedTime(ctx: TenantContext, blockedTimeId: string): Promise<void> {
  authorize(ctx.actor, "employee.manage", { salonId: ctx.salonId });
  const existing = await ctx.db.blockedTime.findUnique({ where: { id: blockedTimeId } });
  if (!existing) throw new NotFoundError("Blocked time");
  await prisma.$transaction(async (tx) => {
    await tx.blockedTime.delete({ where: { id: blockedTimeId, salonId: ctx.salonId } });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "blockedTime.removed",
      entityType: "BlockedTime",
      entityId: blockedTimeId,
      before: {
        employeeId: existing.employeeId,
        startsAt: existing.startsAt.toISOString(),
        endsAt: existing.endsAt.toISOString(),
      },
      request: ctx.request,
    });
  });
}
