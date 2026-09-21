import { createHash, randomBytes } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  ConflictError,
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  PolicyViolationError,
  SlotUnavailableError,
  ValidationError,
} from "@/lib/errors";
import { localDateString } from "@/lib/time";
import { recordAudit } from "@/modules/audit";
import { authorize } from "@/modules/auth/authorize";
import type { Actor, Principal } from "@/modules/auth/types";
import {
  candidatesFor,
  engineInput,
  loadAvailabilityContext,
  type DbLike,
} from "@/modules/booking/availability.service";
import {
  ACTIVE_STATUSES,
  addMinutes,
  canClientCancel,
  canClientReschedule,
  canTransition,
  computeAvailableSlots,
  type ActorKind,
  type BookingStatus,
} from "@/modules/booking/engine";
import { isOverlapViolation } from "@/modules/booking/errors";
import type { CreateAdminBookingInput, CreatePublicBookingInput } from "@/modules/booking/schemas";
import type { TenantContext } from "@/modules/tenant/context";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type BookingView = {
  id: string;
  salon: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
    phone: string | null;
    address: string | null;
  };
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  service: { id: string; name: string };
  employee: { id: string; firstName: string; lastName: string; color: string | null };
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    userId: string | null;
  };
  clientNotes: string | null;
  internalNotes: string | null;
  source: "ONLINE" | "ADMIN" | "WALK_IN";
  version: number;
  createdAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  policy: { canCancel: boolean; cancelUntil: Date; canReschedule: boolean; rescheduleUntil: Date };
};

const bookingSelect = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  durationMinutes: true,
  bufferMinutes: true,
  priceCents: true,
  currency: true,
  serviceNameSnapshot: true,
  clientNotes: true,
  internalNotes: true,
  source: true,
  version: true,
  createdAt: true,
  cancelledAt: true,
  cancellationReason: true,
  salon: {
    select: {
      id: true,
      slug: true,
      name: true,
      timezone: true,
      phone: true,
      address: true,
      settings: { select: { cancellationCutoffHours: true, rescheduleCutoffHours: true } },
    },
  },
  service: { select: { id: true, name: true } },
  employee: { select: { id: true, firstName: true, lastName: true, color: true } },
  customer: {
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, userId: true },
  },
} as const;

type BookingRow = {
  id: string;
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number;
  currency: string;
  serviceNameSnapshot: string;
  clientNotes: string | null;
  internalNotes: string | null;
  source: "ONLINE" | "ADMIN" | "WALK_IN";
  version: number;
  createdAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  salon: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
    phone: string | null;
    address: string | null;
    settings: { cancellationCutoffHours: number; rescheduleCutoffHours: number } | null;
  };
  service: { id: string; name: string } | null;
  employee: { id: string; firstName: string; lastName: string; color: string | null };
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    userId: string | null;
  };
};

export function toView(row: BookingRow, now = new Date()): BookingView {
  const settings = row.salon.settings ?? { cancellationCutoffHours: 12, rescheduleCutoffHours: 12 };
  const cancel = canClientCancel(row, settings, now);
  const reschedule = canClientReschedule(row, settings, now);
  return {
    id: row.id,
    salon: {
      id: row.salon.id,
      slug: row.salon.slug,
      name: row.salon.name,
      timezone: row.salon.timezone,
      phone: row.salon.phone,
      address: row.salon.address,
    },
    status: row.status,
    startsAt: row.startsAt,
    endsAt: addMinutes(row.startsAt, row.durationMinutes),
    durationMinutes: row.durationMinutes,
    priceCents: row.priceCents,
    currency: row.currency,
    service: { id: row.service?.id ?? "", name: row.service?.name ?? row.serviceNameSnapshot },
    employee: row.employee,
    customer: row.customer,
    clientNotes: row.clientNotes,
    internalNotes: row.internalNotes,
    source: row.source,
    version: row.version,
    createdAt: row.createdAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    policy: {
      canCancel: cancel.ok,
      cancelUntil: cancel.until,
      canReschedule: reschedule.ok,
      rescheduleUntil: reschedule.until,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MANAGE_TOKEN_BYTES = 32;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function lockEmployee(tx: DbLike, employeeId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:emp:${employeeId}`}))`;
}

async function upsertCustomer(
  tx: DbLike,
  salonId: string,
  input: {
    userId?: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  },
): Promise<{ id: string }> {
  const email = input.email.toLowerCase();
  if (input.userId) {
    const byUser = await tx.customer.findFirst({
      where: { salonId, userId: input.userId },
      select: { id: true },
    });
    if (byUser) {
      await tx.customer.update({
        where: { id: byUser.id },
        data: { phone: input.phone ?? undefined },
      });
      return byUser;
    }
  }
  const byEmail = await tx.customer.findUnique({
    where: { salonId_email: { salonId, email } },
    select: { id: true, userId: true },
  });
  if (byEmail) {
    await tx.customer.update({
      where: { id: byEmail.id },
      data: {
        userId: byEmail.userId ?? input.userId ?? undefined,
        phone: input.phone ?? undefined,
        firstName: input.firstName,
        lastName: input.lastName,
      },
    });
    return byEmail;
  }
  return tx.customer.create({
    data: {
      salonId,
      userId: input.userId ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      phone: input.phone,
    },
    select: { id: true },
  });
}

function reminderTimes(startsAt: Date, now: Date, enabled: { h24: boolean; h1: boolean }) {
  const out: { kind: "H24" | "H1"; scheduledFor: Date }[] = [];
  const h24 = new Date(startsAt.getTime() - 24 * 3_600_000);
  const h1 = new Date(startsAt.getTime() - 3_600_000);
  if (enabled.h24 && h24.getTime() > now.getTime() + 60_000)
    out.push({ kind: "H24", scheduledFor: h24 });
  if (enabled.h1 && h1.getTime() > now.getTime() + 60_000)
    out.push({ kind: "H1", scheduledFor: h1 });
  return out;
}

async function writeOutbox(
  tx: DbLike,
  salonId: string,
  type: string,
  bookingId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      salonId,
      type,
      aggregateType: "Booking",
      aggregateId: bookingId,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

async function loadBookingRow(
  db: DbLike,
  where: { id: string; salonId?: string },
): Promise<BookingRow> {
  const row = await db.booking.findFirst({ where, select: bookingSelect });
  if (!row) throw new NotFoundError("Booking");
  return row as BookingRow;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateBookingParams = {
  salonId: string;
  serviceId: string;
  employeeId: string | "any";
  startsAt: Date;
  customer: {
    userId?: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  clientNotes?: string | null;
  internalNotes?: string | null;
  source: "ONLINE" | "ADMIN" | "WALK_IN";
  /** Staff bookings skip notice/horizon; working hours and overlaps still apply. */
  ignoreNotice?: boolean;
  requestedStatus?: "PENDING" | "CONFIRMED";
  actor: Principal | "guest";
  request?: { requestId?: string; ip?: string; userAgent?: string };
  now?: Date;
};

export type CreateBookingResult = { booking: BookingView; manageToken: string | null };

/**
 * Creates a booking (docs/booking-system.md §6): validates the slot with the
 * pure engine inside a per-employee advisory lock, inserts the row (the
 * exclusion constraint is the last guard), and writes history, reminders,
 * guest token, audit and outbox event in the same transaction.
 */
export async function createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
  const now = params.now ?? new Date();
  const salon = await prisma.salon.findFirst({
    where: { id: params.salonId, status: "ACTIVE" },
    select: {
      id: true,
      timezone: true,
      currency: true,
      settings: {
        select: {
          autoConfirmBookings: true,
          allowAnyEmployee: true,
          allowGuestBooking: true,
          requirePhone: true,
          reminder24hEnabled: true,
          reminder1hEnabled: true,
        },
      },
    },
  });
  if (!salon) throw new NotFoundError("Salon");
  const settings = salon.settings;
  const isStaff = params.source !== "ONLINE";

  if (!isStaff) {
    if (params.actor === "guest" && settings && !settings.allowGuestBooking)
      throw new PolicyViolationError("GUEST_BOOKING_DISABLED", "Please sign in to book.");
    if (settings?.requirePhone && !params.customer.phone)
      throw new ValidationError("Phone number is required.", {
        fieldErrors: { "customer.phone": "auth.validation.required" },
      });
    if (params.employeeId === "any" && settings && !settings.allowAnyEmployee)
      throw new ValidationError("Please choose an employee.");
  }

  const localDate = localDateString(params.startsAt, salon.timezone);
  const context = await loadAvailabilityContext(prisma, {
    salonId: salon.id,
    serviceId: params.serviceId,
    employeeIds: params.employeeId === "any" ? undefined : [params.employeeId],
    fromDate: localDate,
    toDate: localDate,
  });
  const service = await prisma.service.findFirstOrThrow({
    where: { id: params.serviceId, salonId: salon.id },
    select: { name: true, priceCents: true, currency: true },
  });

  const candidates =
    params.employeeId === "any"
      ? candidatesFor(context, localDate, params.startsAt, now)
      : context.employees.some((e) => e.id === params.employeeId)
        ? [params.employeeId]
        : [];
  if (candidates.length === 0) {
    throw new SlotUnavailableError();
  }

  const status: BookingStatus =
    params.requestedStatus ??
    (settings?.autoConfirmBookings === false && !isStaff ? "PENDING" : "CONFIRMED");
  const bufferMinutes = context.service.bufferAfterMinutes + context.settings.bufferMinutes;
  const durationMinutes = context.service.durationMinutes;
  const actorUserId =
    params.actor !== "guest" && params.actor.kind === "user" ? params.actor.userId : null;
  const actorLabel = params.actor === "guest" ? "GUEST" : isStaff ? "SALON" : "CLIENT";

  let lastError: unknown = new SlotUnavailableError();
  for (const employeeId of candidates) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockEmployee(tx, employeeId);

        // Re-validate with fresh data now that we hold the lock.
        const fresh = await loadAvailabilityContext(tx, {
          salonId: salon.id,
          serviceId: params.serviceId,
          employeeIds: [employeeId],
          fromDate: localDate,
          toDate: localDate,
        });
        const employee = fresh.employees.find((e) => e.id === employeeId);
        if (!employee) throw new SlotUnavailableError();
        const slots = computeAvailableSlots(
          engineInput(fresh, employee, localDate, now, { ignoreNotice: params.ignoreNotice }),
        );
        if (!slots.some((s) => s.startsAt.getTime() === params.startsAt.getTime()))
          throw new SlotUnavailableError();

        const customer = await upsertCustomer(tx, salon.id, params.customer);
        const endsAt = addMinutes(params.startsAt, durationMinutes + bufferMinutes);

        const created = await tx.booking.create({
          data: {
            salonId: salon.id,
            customerId: customer.id,
            employeeId,
            serviceId: params.serviceId,
            status,
            startsAt: params.startsAt,
            endsAt,
            durationMinutes,
            bufferMinutes,
            priceCents: service.priceCents,
            currency: service.currency,
            serviceNameSnapshot: service.name,
            source: params.source,
            clientNotes: params.clientNotes ?? null,
            internalNotes: params.internalNotes ?? null,
            createdById: isStaff ? actorUserId : null,
          },
          select: { id: true },
        });

        await tx.customer.update({
          where: { id: customer.id },
          data: { lastBookingAt: params.startsAt },
        });
        await tx.customer.updateMany({
          where: { id: customer.id, firstBookingAt: null },
          data: { firstBookingAt: params.startsAt },
        });

        await tx.bookingStatusHistory.create({
          data: {
            salonId: salon.id,
            bookingId: created.id,
            fromStatus: null,
            toStatus: status,
            action: "CREATED",
            changedById: actorUserId,
            changedBy: actorLabel,
          },
        });

        const reminders = reminderTimes(params.startsAt, now, {
          h24: settings?.reminder24hEnabled ?? true,
          h1: settings?.reminder1hEnabled ?? true,
        });
        if (reminders.length > 0) {
          await tx.bookingReminder.createMany({
            data: reminders.map((r) => ({
              salonId: salon.id,
              bookingId: created.id,
              kind: r.kind,
              scheduledFor: r.scheduledFor,
            })),
          });
        }

        let manageToken: string | null = null;
        if (params.actor === "guest") {
          manageToken = randomBytes(MANAGE_TOKEN_BYTES).toString("base64url");
          await tx.bookingAccessToken.create({
            data: {
              salonId: salon.id,
              bookingId: created.id,
              tokenHash: hashToken(manageToken),
              expiresAt: new Date(endsAt.getTime() + 7 * 86_400_000),
            },
          });
        }

        if (isStaff && params.actor !== "guest") {
          await recordAudit(tx, {
            salonId: salon.id,
            actor: params.actor,
            action: "booking.created",
            entityType: "Booking",
            entityId: created.id,
            after: {
              employeeId,
              serviceId: params.serviceId,
              startsAt: params.startsAt.toISOString(),
              status,
              source: params.source,
            },
            request: params.request,
          });
        }

        await writeOutbox(tx, salon.id, "booking.created", created.id, {
          bookingId: created.id,
          version: 1,
          status,
          employeeId,
          customerId: customer.id,
        });

        const row = await loadBookingRow(tx, { id: created.id });
        return { booking: toView(row, now), manageToken };
      });
    } catch (error) {
      if (isOverlapViolation(error)) {
        lastError = new SlotUnavailableError();
        continue;
      }
      if (error instanceof SlotUnavailableError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Public / client entry points
// ---------------------------------------------------------------------------

export async function createPublicBooking(
  salonSlug: string,
  input: CreatePublicBookingInput,
  principal: Principal,
  request?: CreateBookingParams["request"],
): Promise<CreateBookingResult> {
  const salon = await prisma.salon.findFirst({
    where: { slug: salonSlug, status: "ACTIVE" },
    select: { id: true },
  });
  if (!salon) throw new NotFoundError("Salon");

  let customer: CreateBookingParams["customer"];
  if (principal.kind === "user") {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { firstName: true, lastName: true, name: true, email: true, phone: true },
    });
    const [first, ...rest] = user.name.split(" ");
    customer = {
      userId: principal.userId,
      firstName: user.firstName ?? first ?? user.name,
      lastName: user.lastName ?? rest.join(" ") ?? "",
      email: user.email,
      phone: input.customer?.phone ?? user.phone ?? null,
    };
  } else {
    if (!input.customer)
      throw new ValidationError("Customer details are required.", {
        fieldErrors: { "customer.email": "auth.validation.required" },
      });
    customer = { ...input.customer, phone: input.customer.phone ?? null };
  }

  return createBooking({
    salonId: salon.id,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    startsAt: input.startsAt,
    customer,
    clientNotes: input.notes ?? null,
    source: "ONLINE",
    actor: principal.kind === "user" ? principal : "guest",
    request,
  });
}

export async function createAdminBooking(
  ctx: TenantContext,
  input: CreateAdminBookingInput,
): Promise<CreateBookingResult> {
  authorize(ctx.actor, "booking.create", { salonId: ctx.salonId });
  let customer: CreateBookingParams["customer"];
  if (input.customerId) {
    const existing = await ctx.db.customer.findUnique({ where: { id: input.customerId } });
    if (!existing) throw new NotFoundError("Customer");
    customer = {
      userId: existing.userId ?? undefined,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      phone: existing.phone,
    };
  } else if (input.customer) {
    customer = { ...input.customer, phone: input.customer.phone ?? null };
  } else {
    throw new ValidationError("Customer is required.");
  }
  return createBooking({
    salonId: ctx.salonId,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    startsAt: input.startsAt,
    customer,
    internalNotes: input.internalNotes ?? null,
    source: input.source,
    ignoreNotice: true,
    requestedStatus: input.status,
    actor: ctx.actor,
    request: ctx.request,
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getBookingByToken(token: string, now = new Date()): Promise<BookingView> {
  const access = await prisma.bookingAccessToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, bookingId: true, salonId: true, expiresAt: true, revokedAt: true },
  });
  if (!access || access.revokedAt || access.expiresAt.getTime() < now.getTime())
    throw new NotFoundError("Booking");
  await prisma.bookingAccessToken.update({ where: { id: access.id }, data: { lastUsedAt: now } });
  return toView(
    await loadBookingRow(prisma, { id: access.bookingId, salonId: access.salonId }),
    now,
  );
}

export async function getBookingForUser(userId: string, bookingId: string): Promise<BookingView> {
  const row = await prisma.booking.findFirst({
    where: { id: bookingId, customer: { userId } },
    select: bookingSelect,
  });
  if (!row) throw new NotFoundError("Booking");
  return toView(row as BookingRow);
}

export async function listBookingsForUser(
  userId: string,
  scope: "upcoming" | "past" | "cancelled",
  now = new Date(),
): Promise<BookingView[]> {
  const where =
    scope === "upcoming"
      ? { status: { in: ["PENDING", "CONFIRMED"] as BookingStatus[] }, startsAt: { gte: now } }
      : scope === "past"
        ? {
            OR: [
              { status: { in: ["COMPLETED", "NO_SHOW"] as BookingStatus[] } },
              {
                status: { in: ["PENDING", "CONFIRMED"] as BookingStatus[] },
                startsAt: { lt: now },
              },
            ],
          }
        : { status: "CANCELLED" as BookingStatus };
  const rows = await prisma.booking.findMany({
    where: { customer: { userId }, ...where },
    orderBy: { startsAt: scope === "upcoming" ? "asc" : "desc" },
    take: 100,
    select: bookingSelect,
  });
  return rows.map((r) => toView(r as BookingRow, now));
}

export async function getBookingForSalon(
  ctx: TenantContext,
  bookingId: string,
): Promise<BookingView> {
  const view = toView(await loadBookingRow(prisma, { id: bookingId, salonId: ctx.salonId }));
  assertEmployeeScope(ctx, view);
  return view;
}

function assertEmployeeScope(ctx: TenantContext, view: BookingView): void {
  if (ctx.role === "EMPLOYEE") {
    const own = ctx.actor.memberships.find((m) => m.salonId === ctx.salonId)?.employeeId;
    if (!own || own !== view.employee.id) throw new NotFoundError("Booking");
  }
}

export async function listBookingsForSalon(
  ctx: TenantContext,
  query: {
    from?: Date;
    to?: Date;
    employeeId?: string;
    status?: BookingStatus;
    customerId?: string;
  },
): Promise<BookingView[]> {
  const ownEmployeeId =
    ctx.role === "EMPLOYEE"
      ? ctx.actor.memberships.find((m) => m.salonId === ctx.salonId)?.employeeId
      : undefined;
  if (ctx.role === "EMPLOYEE") {
    authorize(ctx.actor, "booking.readOwn", { salonId: ctx.salonId });
    if (!ownEmployeeId) return [];
  } else {
    authorize(ctx.actor, "booking.readAll", { salonId: ctx.salonId });
  }
  const rows = await prisma.booking.findMany({
    where: {
      salonId: ctx.salonId,
      ...(ownEmployeeId
        ? { employeeId: ownEmployeeId }
        : query.employeeId
          ? { employeeId: query.employeeId }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.from || query.to
        ? {
            startsAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lt: query.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { startsAt: "asc" },
    take: 500,
    select: bookingSelect,
  });
  const now = new Date();
  return rows.map((r) => toView(r as BookingRow, now));
}

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------

type MutationActor =
  | { kind: "client"; userId: string }
  | { kind: "guest"; token: string }
  | { kind: "staff"; ctx: TenantContext };

async function resolveTarget(
  actor: MutationActor,
  bookingId: string | null,
  now: Date,
): Promise<{
  row: BookingRow;
  actorKind: ActorKind;
  label: string;
  userId: string | null;
  ctx?: TenantContext;
}> {
  if (actor.kind === "guest") {
    const access = await prisma.bookingAccessToken.findUnique({
      where: { tokenHash: hashToken(actor.token) },
      select: { bookingId: true, salonId: true, expiresAt: true, revokedAt: true },
    });
    if (!access || access.revokedAt || access.expiresAt.getTime() < now.getTime())
      throw new NotFoundError("Booking");
    return {
      row: await loadBookingRow(prisma, { id: access.bookingId, salonId: access.salonId }),
      actorKind: "client",
      label: "GUEST",
      userId: null,
    };
  }
  if (actor.kind === "client") {
    const row = await prisma.booking.findFirst({
      where: { id: bookingId ?? "", customer: { userId: actor.userId } },
      select: bookingSelect,
    });
    if (!row) throw new NotFoundError("Booking");
    return { row: row as BookingRow, actorKind: "client", label: "CLIENT", userId: actor.userId };
  }
  const row = await loadBookingRow(prisma, { id: bookingId ?? "", salonId: actor.ctx.salonId });
  const isEmployeeRole = actor.ctx.role === "EMPLOYEE";
  if (isEmployeeRole) assertEmployeeScope(actor.ctx, toView(row, now));
  return {
    row,
    actorKind: isEmployeeRole ? "employee" : "staff",
    label: "SALON",
    userId: actor.ctx.actor.userId,
    ctx: actor.ctx,
  };
}

export async function rescheduleBooking(
  actor: MutationActor,
  bookingId: string | null,
  input: { startsAt: Date; employeeId?: string; version: number },
  now = new Date(),
): Promise<BookingView> {
  const target = await resolveTarget(actor, bookingId, now);
  const { row } = target;
  if (row.version !== input.version) throw new ConflictError();
  if (target.actorKind === "client") {
    const policy = canClientReschedule(
      row,
      row.salon.settings ?? { rescheduleCutoffHours: 12 },
      now,
    );
    if (!policy.ok) throw new PolicyViolationError(policy.reason);
  } else {
    if (target.actorKind === "employee") throw new ForbiddenError();
    authorize(target.ctx!.actor, "booking.update", { salonId: row.salon.id });
    if (!ACTIVE_STATUSES.includes(row.status))
      throw new InvalidTransitionError(row.status, row.status);
  }

  const employeeId = input.employeeId ?? row.employee.id;
  const localDate = localDateString(input.startsAt, row.salon.timezone);
  const ignoreNotice = target.actorKind === "staff";

  try {
    return await prisma.$transaction(async (tx) => {
      const lockIds = [...new Set([row.employee.id, employeeId])].sort();
      for (const id of lockIds) await lockEmployee(tx, id);

      const context = await loadAvailabilityContext(tx, {
        salonId: row.salon.id,
        serviceId: row.service?.id ?? "",
        employeeIds: [employeeId],
        fromDate: localDate,
        toDate: localDate,
      });
      const employee = context.employees.find((e) => e.id === employeeId);
      if (!employee) throw new SlotUnavailableError();
      const slots = computeAvailableSlots(
        engineInput(context, employee, localDate, now, {
          exclude: { start: row.startsAt, end: row.endsAt },
          ignoreNotice,
        }),
      );
      if (!slots.some((s) => s.startsAt.getTime() === input.startsAt.getTime()))
        throw new SlotUnavailableError();

      const endsAt = addMinutes(input.startsAt, row.durationMinutes + row.bufferMinutes);
      const updated = await tx.booking.updateMany({
        where: { id: row.id, version: input.version },
        data: { startsAt: input.startsAt, endsAt, employeeId, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictError();

      await tx.bookingStatusHistory.create({
        data: {
          salonId: row.salon.id,
          bookingId: row.id,
          fromStatus: row.status,
          toStatus: row.status,
          action: "RESCHEDULED",
          previousStartsAt: row.startsAt,
          newStartsAt: input.startsAt,
          changedById: target.userId,
          changedBy: target.label,
        },
      });

      await tx.bookingReminder.updateMany({
        where: { bookingId: row.id, status: "SCHEDULED" },
        data: { status: "CANCELLED" },
      });
      const settings = await tx.salonSettings.findUnique({
        where: { salonId: row.salon.id },
        select: { reminder24hEnabled: true, reminder1hEnabled: true },
      });
      const reminders = reminderTimes(input.startsAt, now, {
        h24: settings?.reminder24hEnabled ?? true,
        h1: settings?.reminder1hEnabled ?? true,
      });
      for (const r of reminders) {
        await tx.bookingReminder.upsert({
          where: {
            bookingId_kind_scheduledFor: {
              bookingId: row.id,
              kind: r.kind,
              scheduledFor: r.scheduledFor,
            },
          },
          update: { status: "SCHEDULED", sentAt: null },
          create: {
            salonId: row.salon.id,
            bookingId: row.id,
            kind: r.kind,
            scheduledFor: r.scheduledFor,
          },
        });
      }

      if (target.ctx) {
        await recordAudit(tx, {
          salonId: row.salon.id,
          actor: target.ctx.actor,
          action: "booking.rescheduled",
          entityType: "Booking",
          entityId: row.id,
          before: { startsAt: row.startsAt.toISOString(), employeeId: row.employee.id },
          after: { startsAt: input.startsAt.toISOString(), employeeId },
          request: target.ctx.request,
        });
      }
      await writeOutbox(tx, row.salon.id, "booking.rescheduled", row.id, {
        bookingId: row.id,
        version: row.version + 1,
        previousStartsAt: row.startsAt.toISOString(),
        newStartsAt: input.startsAt.toISOString(),
        previousEmployeeId: row.employee.id,
        newEmployeeId: employeeId,
        actor: target.label,
      });

      return toView(await loadBookingRow(tx, { id: row.id }), now);
    });
  } catch (error) {
    if (isOverlapViolation(error)) throw new SlotUnavailableError();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Cancel / status
// ---------------------------------------------------------------------------

export async function cancelBooking(
  actor: MutationActor,
  bookingId: string | null,
  input: { reason: string | null; version: number },
  now = new Date(),
): Promise<BookingView> {
  const target = await resolveTarget(actor, bookingId, now);
  const { row } = target;
  if (row.version !== input.version) throw new ConflictError();
  if (target.actorKind === "client") {
    const policy = canClientCancel(row, row.salon.settings ?? { cancellationCutoffHours: 12 }, now);
    if (!policy.ok) throw new PolicyViolationError(policy.reason);
  } else {
    if (target.actorKind === "employee") throw new ForbiddenError();
    authorize(target.ctx!.actor, "booking.updateStatus", { salonId: row.salon.id });
  }
  if (!canTransition(row.status, "CANCELLED", target.actorKind))
    throw new InvalidTransitionError(row.status, "CANCELLED");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: row.id, version: input.version },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledById: target.userId,
        cancelledBy: target.label,
        cancellationReason: input.reason,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ConflictError();
    await tx.bookingStatusHistory.create({
      data: {
        salonId: row.salon.id,
        bookingId: row.id,
        fromStatus: row.status,
        toStatus: "CANCELLED",
        action: "CANCELLED",
        changedById: target.userId,
        changedBy: target.label,
        reason: input.reason,
      },
    });
    await tx.bookingReminder.updateMany({
      where: { bookingId: row.id, status: "SCHEDULED" },
      data: { status: "CANCELLED" },
    });
    if (target.ctx) {
      await recordAudit(tx, {
        salonId: row.salon.id,
        actor: target.ctx.actor,
        action: "booking.cancelled",
        entityType: "Booking",
        entityId: row.id,
        before: { status: row.status },
        after: { status: "CANCELLED", reason: input.reason },
        request: target.ctx.request,
      });
    }
    await writeOutbox(tx, row.salon.id, "booking.cancelled", row.id, {
      bookingId: row.id,
      version: row.version + 1,
      cancelledBy: target.label,
      reason: input.reason,
    });
    return toView(await loadBookingRow(tx, { id: row.id }), now);
  });
}

export async function changeBookingStatus(
  ctx: TenantContext,
  bookingId: string,
  input: { status: BookingStatus; reason: string | null; version: number },
  now = new Date(),
): Promise<BookingView> {
  if (input.status === "CANCELLED")
    return cancelBooking(
      { kind: "staff", ctx },
      bookingId,
      { reason: input.reason, version: input.version },
      now,
    );
  const target = await resolveTarget({ kind: "staff", ctx }, bookingId, now);
  const { row } = target;
  if (row.version !== input.version) throw new ConflictError();
  if (target.actorKind === "employee") {
    authorize(ctx.actor, "booking.completeOwn", { salonId: ctx.salonId });
  } else {
    authorize(ctx.actor, "booking.updateStatus", { salonId: ctx.salonId });
  }
  if (!canTransition(row.status, input.status, target.actorKind))
    throw new InvalidTransitionError(row.status, input.status);
  if (
    (input.status === "COMPLETED" || input.status === "NO_SHOW") &&
    row.startsAt.getTime() > now.getTime()
  ) {
    throw new PolicyViolationError("NOT_STARTED", "The appointment has not started yet.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: row.id, version: input.version },
      data: { status: input.status, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConflictError();
    await tx.bookingStatusHistory.create({
      data: {
        salonId: row.salon.id,
        bookingId: row.id,
        fromStatus: row.status,
        toStatus: input.status,
        action: "STATUS_CHANGED",
        changedById: ctx.actor.userId,
        changedBy: "SALON",
        reason: input.reason,
      },
    });
    if (input.status === "COMPLETED" || input.status === "NO_SHOW") {
      await tx.bookingReminder.updateMany({
        where: { bookingId: row.id, status: "SCHEDULED" },
        data: { status: "CANCELLED" },
      });
    }
    await recordAudit(tx, {
      salonId: row.salon.id,
      actor: ctx.actor,
      action: "booking.statusChanged",
      entityType: "Booking",
      entityId: row.id,
      before: { status: row.status },
      after: { status: input.status },
      request: ctx.request,
    });
    await writeOutbox(tx, row.salon.id, "booking.statusChanged", row.id, {
      bookingId: row.id,
      version: row.version + 1,
      from: row.status,
      to: input.status,
    });
    return toView(await loadBookingRow(tx, { id: row.id }), now);
  });
}

export type { Actor };
