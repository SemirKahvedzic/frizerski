import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth/types";

import type { NotificationPreferencesInput, UpdateProfileInput } from "./schemas";

export type ProfileView = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  locale: "bs" | "en";
};

export type NotificationPreferences = NotificationPreferencesInput;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailEnabled: true,
  pushEnabled: false,
  reminder24h: true,
  reminder1h: true,
  marketingEmails: false,
};

const profileSelect = {
  id: true,
  email: true,
  emailVerified: true,
  name: true,
  firstName: true,
  lastName: true,
  phone: true,
  locale: true,
} as const;

type ProfileRow = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  locale: string | null;
};

function toProfile(row: ProfileRow): ProfileView {
  const [first = "", ...rest] = row.name.split(" ");
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    name: row.name,
    firstName: row.firstName ?? first,
    lastName: row.lastName ?? rest.join(" "),
    phone: row.phone,
    locale: row.locale === "en" ? "en" : "bs",
  };
}

export async function getProfile(userId: string): Promise<ProfileView> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: profileSelect });
  if (!row) throw new NotFoundError("User");
  return toProfile(row);
}

/** Updates the client's own profile. `name` (used by Better Auth) is kept in sync. */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileView> {
  const row = await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      name: `${input.firstName} ${input.lastName}`,
      phone: input.phone,
      locale: input.locale,
    },
    select: profileSelect,
  });
  return toProfile(row);
}

/** Preferences are created lazily: users without a row get the defaults. */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: {
      emailEnabled: true,
      pushEnabled: true,
      reminder24h: true,
      reminder1h: true,
      marketingEmails: true,
    },
  });
  return row ?? DEFAULT_NOTIFICATION_PREFERENCES;
}

export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferencesInput,
): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
    select: {
      emailEnabled: true,
      pushEnabled: true,
      reminder24h: true,
      reminder1h: true,
      marketingEmails: true,
    },
  });
  return row;
}

/**
 * Links guest customer records (bookings made without an account) to the
 * signed-in user once their email is verified. When the user already has a
 * customer record in that salon, the guest record's bookings are moved onto
 * it and the duplicate is removed. Returns the number of salons affected.
 */
export async function claimGuestCustomers(actor: Actor): Promise<number> {
  if (!actor.emailVerified) return 0;
  const email = actor.email.toLowerCase();
  const guests = await prisma.customer.findMany({
    where: { email, userId: null },
    select: { id: true, salonId: true },
  });
  if (guests.length === 0) return 0;

  let claimed = 0;
  for (const guest of guests) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findFirst({
        where: { salonId: guest.salonId, userId: actor.userId },
        select: { id: true },
      });
      if (!existing) {
        await tx.customer.update({ where: { id: guest.id }, data: { userId: actor.userId } });
      } else {
        await tx.booking.updateMany({
          where: { customerId: guest.id },
          data: { customerId: existing.id },
        });
        await tx.customer.delete({ where: { id: guest.id } });
      }
    });
    claimed += 1;
  }
  return claimed;
}
