import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnectPrisma, prisma } from "@/lib/db";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  claimGuestCustomers,
  getNotificationPreferences,
  getProfile,
  updateNotificationPreferences,
  updateProfile,
} from "@/modules/account";
import type { Actor } from "@/modules/auth/types";
import { createSalon } from "@/modules/salons";

const PREFIX = "acct-test";

async function makeActor(label: string, emailVerified = true): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@acct.local`,
      name: `${label} User`,
      emailVerified,
      firstName: label,
      lastName: "User",
    },
  });
  return {
    kind: "user",
    userId: user.id,
    email: user.email,
    name: user.name,
    emailVerified,
    isActive: true,
    locale: "bs",
    platformRole: null,
    memberships: [],
  };
}

describe("account module", () => {
  let owner: Actor;
  let salonId: string;

  beforeAll(async () => {
    owner = await makeActor("owner");
    const salon = await createSalon(owner, {
      name: `${PREFIX} Salon`,
      audience: "UNISEX",
      timezone: "Europe/Sarajevo",
      currency: "BAM",
      defaultLocale: "bs",
    });
    salonId = salon.id;
  });

  afterAll(async () => {
    await prisma.salon.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await disconnectPrisma();
  });

  it("updates the profile and keeps the display name in sync", async () => {
    const actor = await makeActor("profile");
    const updated = await updateProfile(actor.userId, {
      firstName: "Amina",
      lastName: "Hodžić",
      phone: "+387 61 000 111",
      locale: "en",
    });
    expect(updated).toMatchObject({
      name: "Amina Hodžić",
      firstName: "Amina",
      phone: "+387 61 000 111",
      locale: "en",
    });
    expect((await getProfile(actor.userId)).name).toBe("Amina Hodžić");
  });

  it("returns default preferences without a row and upserts on update", async () => {
    const actor = await makeActor("prefs");
    expect(await getNotificationPreferences(actor.userId)).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
    const saved = await updateNotificationPreferences(actor.userId, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      reminder1h: false,
    });
    expect(saved.reminder1h).toBe(false);
    const again = await updateNotificationPreferences(actor.userId, {
      ...saved,
      emailEnabled: false,
    });
    expect(again).toMatchObject({ reminder1h: false, emailEnabled: false });
    expect(await prisma.notificationPreference.count({ where: { userId: actor.userId } })).toBe(1);
  });

  it("links guest customers to a verified account and merges duplicates", async () => {
    const actor = await makeActor("claim");
    const guest = await prisma.customer.create({
      data: {
        salonId,
        firstName: "Guest",
        lastName: "Claim",
        email: actor.email.toLowerCase(),
        phone: null,
      },
    });
    expect(await claimGuestCustomers(actor)).toBe(1);
    const linked = await prisma.customer.findUnique({ where: { id: guest.id } });
    expect(linked?.userId).toBe(actor.userId);

    // A second guest record with the same email in a different case merges into the linked one.
    const other = await createSalon(await makeActor("owner2"), {
      name: `${PREFIX} Salon 2`,
      audience: "UNISEX",
      timezone: "Europe/Sarajevo",
      currency: "BAM",
      defaultLocale: "bs",
    });
    await prisma.customer.create({
      data: {
        salonId: other.id,
        firstName: "Guest",
        lastName: "Two",
        email: actor.email.toLowerCase(),
        phone: null,
      },
    });
    expect(await claimGuestCustomers(actor)).toBe(1);
    expect(await claimGuestCustomers(actor)).toBe(0);
  });

  it("does nothing for unverified accounts", async () => {
    const actor = await makeActor("unverified", false);
    await prisma.customer.create({
      data: {
        salonId,
        firstName: "Guest",
        lastName: "Unverified",
        email: actor.email.toLowerCase(),
        phone: null,
      },
    });
    expect(await claimGuestCustomers(actor)).toBe(0);
    expect(
      await prisma.customer.count({ where: { email: actor.email.toLowerCase(), userId: null } }),
    ).toBe(1);
  });
});
