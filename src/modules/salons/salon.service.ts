import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { slugify, uniqueSlug } from "@/lib/slug";
import { dateStringToUtc, utcToDateString } from "@/lib/time";
import { recordAudit } from "@/modules/audit";
import { diffSnapshots } from "@/modules/audit/diff";
import { authorize, requireUser, requireVerifiedEmail } from "@/modules/auth/authorize";
import type { Principal } from "@/modules/auth/types";
import { defaultWorkingHours } from "@/modules/salons/defaults";
import type {
  CreateClosureInput,
  CreateSalonInput,
  UpdateSalonProfileInput,
  UpdateSalonSettingsInput,
  WorkingHoursInput,
} from "@/modules/salons/schemas";
import type { RequestMeta, TenantContext } from "@/modules/tenant/context";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type SalonSummary = {
  id: string;
  slug: string;
  name: string;
  audience: "MALE" | "FEMALE" | "UNISEX";
  timezone: string;
  currency: string;
  defaultLocale: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  createdAt: Date;
};

const summarySelect = {
  id: true,
  slug: true,
  name: true,
  audience: true,
  timezone: true,
  currency: true,
  defaultLocale: true,
  status: true,
  createdAt: true,
} as const;

const PROFILE_KEYS = [
  "name",
  "description",
  "category",
  "audience",
  "address",
  "city",
  "postalCode",
  "country",
  "phone",
  "email",
  "website",
  "instagram",
  "facebook",
  "tiktok",
  "googleMapsUrl",
  "brandColor",
  "defaultLocale",
] as const;

const profileSelect = {
  ...summarySelect,
  description: true,
  category: true,
  address: true,
  city: true,
  postalCode: true,
  country: true,
  latitude: true,
  longitude: true,
  googleMapsUrl: true,
  phone: true,
  email: true,
  website: true,
  instagram: true,
  facebook: true,
  tiktok: true,
  brandColor: true,
  updatedAt: true,
} as const;

export type SalonProfile = SalonSummary & {
  description: string | null;
  category: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  brandColor: string | null;
  updatedAt: Date;
};

const SETTINGS_KEYS = [
  "slotIntervalMinutes",
  "minBookingNoticeMinutes",
  "maxBookingAdvanceDays",
  "cancellationCutoffHours",
  "rescheduleCutoffHours",
  "bufferMinutes",
  "autoConfirmBookings",
  "allowAnyEmployee",
  "allowGuestBooking",
  "requirePhone",
  "emailNotificationsEnabled",
  "pushNotificationsEnabled",
  "notifyAdminsOnNewBooking",
  "notifyEmployeeOnNewBooking",
  "reminder24hEnabled",
  "reminder1hEnabled",
] as const;

export type SalonSettingsView = Record<(typeof SETTINGS_KEYS)[number], number | boolean> & {
  slotIntervalMinutes: number;
  minBookingNoticeMinutes: number;
  maxBookingAdvanceDays: number;
  cancellationCutoffHours: number;
  rescheduleCutoffHours: number;
  bufferMinutes: number;
  autoConfirmBookings: boolean;
  allowAnyEmployee: boolean;
  allowGuestBooking: boolean;
  requirePhone: boolean;
  emailNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  notifyAdminsOnNewBooking: boolean;
  notifyEmployeeOnNewBooking: boolean;
  reminder24hEnabled: boolean;
  reminder1hEnabled: boolean;
  timezone: string;
  currency: string;
};

export type WorkingDay = { weekday: number; isClosed: boolean; opensAt: string; closesAt: string };

export type Closure = { id: string; startsOn: string; endsOn: string; reason: string | null };

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Any signed-in user with a verified email can open a salon and becomes its
 * OWNER. Salon, settings, default opening hours, membership and audit row are
 * written in one transaction.
 */
export async function createSalon(
  principal: Principal,
  input: CreateSalonInput,
  request?: RequestMeta,
): Promise<SalonSummary> {
  const actor = requireVerifiedEmail(requireUser(principal));

  const requestedSlug = input.slug && input.slug.length > 0 ? input.slug : slugify(input.name);
  const slug = await uniqueSlug(requestedSlug, async (candidate) =>
    Boolean(await prisma.salon.findUnique({ where: { slug: candidate }, select: { id: true } })),
  );
  if (input.slug && slug !== input.slug) {
    throw new ConflictError("This address is already taken.", { field: "slug" });
  }

  return prisma.$transaction(async (tx) => {
    const salon = await tx.salon.create({
      data: {
        name: input.name,
        slug,
        audience: input.audience,
        timezone: input.timezone,
        currency: input.currency,
        defaultLocale: input.defaultLocale,
        settings: { create: {} },
        workingHours: { create: defaultWorkingHours() },
      },
      select: summarySelect,
    });

    await tx.salonMembership.create({
      data: { salonId: salon.id, userId: actor.userId, role: "OWNER" },
    });

    await recordAudit(tx, {
      salonId: salon.id,
      actor,
      action: "salon.created",
      entityType: "Salon",
      entityId: salon.id,
      after: {
        name: salon.name,
        slug: salon.slug,
        audience: salon.audience,
        timezone: salon.timezone,
      },
      request,
    });

    return salon;
  });
}

export type SalonWithRole = SalonSummary & { role: "OWNER" | "ADMIN" | "EMPLOYEE" };

/** Salons the actor belongs to, with their role. */
export async function listSalonsForActor(principal: Principal): Promise<SalonWithRole[]> {
  const actor = requireUser(principal);
  if (actor.memberships.length === 0) return [];

  const salons = await prisma.salon.findMany({
    where: { id: { in: actor.memberships.map((m) => m.salonId) } },
    select: summarySelect,
    orderBy: { createdAt: "asc" },
  });

  return salons.map((salon) => ({
    ...salon,
    role: actor.memberships.find((m) => m.salonId === salon.id)?.role ?? "EMPLOYEE",
  }));
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** The salon of the current tenant context (read through the scoped client). */
export async function getSalon(ctx: TenantContext): Promise<SalonSummary> {
  return ctx.db.salon.findUniqueOrThrow({ where: { id: ctx.salonId }, select: summarySelect });
}

export async function getSalonProfile(ctx: TenantContext): Promise<SalonProfile> {
  return ctx.db.salon.findUniqueOrThrow({ where: { id: ctx.salonId }, select: profileSelect });
}

export async function updateSalonProfile(
  ctx: TenantContext,
  input: UpdateSalonProfileInput,
): Promise<SalonProfile> {
  authorize(ctx.actor, "salon.update", { salonId: ctx.salonId });
  const before = await getSalonProfile(ctx);

  return prisma.$transaction(async (tx) => {
    const after = await tx.salon.update({
      where: { id: ctx.salonId },
      data: {
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? null,
        audience: input.audience,
        address: input.address ?? null,
        city: input.city ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        website: input.website ?? null,
        instagram: input.instagram ?? null,
        facebook: input.facebook ?? null,
        tiktok: input.tiktok ?? null,
        googleMapsUrl: input.googleMapsUrl ?? null,
        brandColor: input.brandColor ?? null,
        defaultLocale: input.defaultLocale,
      },
      select: profileSelect,
    });

    const diff = diffSnapshots(before, after, PROFILE_KEYS);
    if (diff.changed.length > 0) {
      await recordAudit(tx, {
        salonId: ctx.salonId,
        actor: ctx.actor,
        action: "salon.profileUpdated",
        entityType: "Salon",
        entityId: ctx.salonId,
        before: diff.before,
        after: diff.after,
        request: ctx.request,
      });
    }
    return after;
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSalonSettings(ctx: TenantContext): Promise<SalonSettingsView> {
  const [salon, settings] = await Promise.all([
    ctx.db.salon.findUniqueOrThrow({
      where: { id: ctx.salonId },
      select: { timezone: true, currency: true },
    }),
    ctx.db.salonSettings.upsert({
      where: { salonId: ctx.salonId },
      update: {},
      create: { salonId: ctx.salonId },
    }),
  ]);
  return { ...pickSettings(settings), timezone: salon.timezone, currency: salon.currency };
}

function pickSettings(row: Record<string, unknown>) {
  const out = {} as Record<(typeof SETTINGS_KEYS)[number], never>;
  for (const key of SETTINGS_KEYS) {
    (out as Record<string, unknown>)[key] = row[key];
  }
  return out as unknown as Omit<SalonSettingsView, "timezone" | "currency">;
}

export async function updateSalonSettings(
  ctx: TenantContext,
  input: UpdateSalonSettingsInput,
): Promise<SalonSettingsView> {
  authorize(ctx.actor, "settings.update", { salonId: ctx.salonId });
  const before = await getSalonSettings(ctx);
  const { timezone, currency, ...settings } = input;

  return prisma.$transaction(async (tx) => {
    const [salon, row] = await Promise.all([
      tx.salon.update({
        where: { id: ctx.salonId },
        data: { timezone, currency },
        select: { timezone: true, currency: true },
      }),
      tx.salonSettings.upsert({
        where: { salonId: ctx.salonId },
        update: settings,
        create: { salonId: ctx.salonId, ...settings },
      }),
    ]);

    const after: SalonSettingsView = {
      ...pickSettings(row),
      timezone: salon.timezone,
      currency: salon.currency,
    };
    const diff = diffSnapshots(before, after, [...SETTINGS_KEYS, "timezone", "currency"]);
    if (diff.changed.length > 0) {
      await recordAudit(tx, {
        salonId: ctx.salonId,
        actor: ctx.actor,
        action: "salon.settingsUpdated",
        entityType: "SalonSettings",
        entityId: ctx.salonId,
        before: diff.before,
        after: diff.after,
        request: ctx.request,
      });
    }
    return after;
  });
}

// ---------------------------------------------------------------------------
// Working hours
// ---------------------------------------------------------------------------

export async function getWorkingHours(ctx: TenantContext): Promise<WorkingDay[]> {
  const rows = await ctx.db.salonWorkingHours.findMany({
    where: { salonId: ctx.salonId },
    orderBy: { weekday: "asc" },
    select: { weekday: true, isClosed: true, opensAt: true, closesAt: true },
  });
  if (rows.length === 7) return rows;
  // Fill gaps with defaults so the editor always shows seven days.
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  return defaultWorkingHours().map((d) => byDay.get(d.weekday) ?? d);
}

export async function setWorkingHours(
  ctx: TenantContext,
  input: WorkingHoursInput,
): Promise<WorkingDay[]> {
  authorize(ctx.actor, "workingHours.update", { salonId: ctx.salonId });
  const before = await getWorkingHours(ctx);

  const days = [...input]
    .sort((a, b) => a.weekday - b.weekday)
    .map((d) => ({
      weekday: d.weekday,
      isClosed: d.isClosed,
      opensAt: d.opensAt,
      closesAt: d.closesAt,
    }));

  await prisma.$transaction(async (tx) => {
    for (const day of days) {
      await tx.salonWorkingHours.upsert({
        where: { salonId_weekday: { salonId: ctx.salonId, weekday: day.weekday } },
        update: { isClosed: day.isClosed, opensAt: day.opensAt, closesAt: day.closesAt },
        create: { salonId: ctx.salonId, ...day },
      });
    }
    const changed = days.filter((d) => {
      const prev = before.find((b) => b.weekday === d.weekday);
      return (
        !prev ||
        prev.isClosed !== d.isClosed ||
        prev.opensAt !== d.opensAt ||
        prev.closesAt !== d.closesAt
      );
    });
    if (changed.length > 0) {
      await recordAudit(tx, {
        salonId: ctx.salonId,
        actor: ctx.actor,
        action: "salon.workingHoursUpdated",
        entityType: "SalonWorkingHours",
        entityId: ctx.salonId,
        before: { days: before.filter((b) => changed.some((c) => c.weekday === b.weekday)) },
        after: { days: changed },
        request: ctx.request,
      });
    }
  });

  return days;
}

// ---------------------------------------------------------------------------
// Closures
// ---------------------------------------------------------------------------

function toClosure(row: {
  id: string;
  startsOn: Date;
  endsOn: Date;
  reason: string | null;
}): Closure {
  return {
    id: row.id,
    startsOn: utcToDateString(row.startsOn),
    endsOn: utcToDateString(row.endsOn),
    reason: row.reason,
  };
}

export async function listClosures(
  ctx: TenantContext,
  options: { from?: string } = {},
): Promise<Closure[]> {
  const rows = await ctx.db.salonClosure.findMany({
    where: {
      salonId: ctx.salonId,
      ...(options.from ? { endsOn: { gte: dateStringToUtc(options.from) } } : {}),
    },
    orderBy: { startsOn: "asc" },
    select: { id: true, startsOn: true, endsOn: true, reason: true },
  });
  return rows.map(toClosure);
}

export async function addClosure(ctx: TenantContext, input: CreateClosureInput): Promise<Closure> {
  authorize(ctx.actor, "workingHours.update", { salonId: ctx.salonId });

  return prisma.$transaction(async (tx) => {
    const row = await tx.salonClosure.create({
      data: {
        salonId: ctx.salonId,
        startsOn: dateStringToUtc(input.startsOn),
        endsOn: dateStringToUtc(input.endsOn),
        reason: input.reason ?? null,
        createdById: ctx.actor.userId,
      },
      select: { id: true, startsOn: true, endsOn: true, reason: true },
    });
    const closure = toClosure(row);
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "salon.closureAdded",
      entityType: "SalonClosure",
      entityId: closure.id,
      after: { startsOn: closure.startsOn, endsOn: closure.endsOn, reason: closure.reason },
      request: ctx.request,
    });
    return closure;
  });
}

export async function removeClosure(ctx: TenantContext, closureId: string): Promise<void> {
  authorize(ctx.actor, "workingHours.update", { salonId: ctx.salonId });
  const existing = await ctx.db.salonClosure.findUnique({
    where: { id: closureId },
    select: { id: true, startsOn: true, endsOn: true, reason: true },
  });
  if (!existing) throw new NotFoundError("Closure");
  const closure = toClosure(existing);

  await prisma.$transaction(async (tx) => {
    await tx.salonClosure.delete({ where: { id: closureId, salonId: ctx.salonId } });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "salon.closureRemoved",
      entityType: "SalonClosure",
      entityId: closureId,
      before: { startsOn: closure.startsOn, endsOn: closure.endsOn, reason: closure.reason },
      request: ctx.request,
    });
  });
}
