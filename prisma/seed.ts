/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Grows phase by phase (see docs/setup.md §10).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";

import { PrismaClient } from "../src/generated/prisma/client";
import type { Audience, SalonRole } from "../src/generated/prisma/enums";
import { defaultWorkingHours } from "../src/modules/salons/defaults";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = process.env["SEED_OWNER_PASSWORD"] ?? "Owner12345!";

type SeedUser = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  locale?: string;
  platformRole?: "SUPER_ADMIN";
};

/**
 * Creates a user with an email/password credential the same way Better Auth
 * does (`accounts.provider_id = "credential"`, scrypt hash), without going
 * through the HTTP layer.
 */
async function upsertUser(input: SeedUser) {
  const email = input.email.toLowerCase();
  const name = `${input.firstName} ${input.lastName}`;
  const data = {
    name,
    firstName: input.firstName,
    lastName: input.lastName,
    locale: input.locale ?? "bs",
    platformRole: input.platformRole ?? null,
    emailVerified: true,
    isActive: true,
  };

  const user = await prisma.user.upsert({
    where: { email },
    update: data,
    create: { email, ...data },
  });

  const password = await hashPassword(input.password);
  const existing = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password } });
  } else {
    await prisma.account.create({
      data: { userId: user.id, providerId: "credential", accountId: user.id, password },
    });
  }
  return user;
}

type SeedSalon = {
  slug: string;
  name: string;
  audience: Audience;
  profile: {
    description: string;
    category: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    phone: string;
    email: string;
    website?: string;
    instagram?: string;
  };
  hours?: { weekday: number; isClosed: boolean; opensAt: string; closesAt: string }[];
  members: { email: string; role: SalonRole }[];
};

async function upsertSalon(input: SeedSalon) {
  const salon = await prisma.salon.upsert({
    where: { slug: input.slug },
    update: { name: input.name, audience: input.audience, status: "ACTIVE", ...input.profile },
    create: { slug: input.slug, name: input.name, audience: input.audience, ...input.profile },
  });

  await prisma.salonSettings.upsert({
    where: { salonId: salon.id },
    update: {},
    create: { salonId: salon.id },
  });

  for (const day of input.hours ?? defaultWorkingHours()) {
    await prisma.salonWorkingHours.upsert({
      where: { salonId_weekday: { salonId: salon.id, weekday: day.weekday } },
      update: { isClosed: day.isClosed, opensAt: day.opensAt, closesAt: day.closesAt },
      create: { salonId: salon.id, ...day },
    });
  }

  for (const member of input.members) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: member.email } });
    await prisma.salonMembership.upsert({
      where: { userId_salonId: { userId: user.id, salonId: salon.id } },
      update: { role: member.role },
      create: { userId: user.id, salonId: salon.id, role: member.role },
    });
  }
  return salon;
}

async function main() {
  const superAdmin = await upsertUser({
    email: process.env["SEED_SUPER_ADMIN_EMAIL"] ?? "admin@platform.local",
    password: process.env["SEED_SUPER_ADMIN_PASSWORD"] ?? "Admin12345!",
    firstName: "Platform",
    lastName: "Admin",
    platformRole: "SUPER_ADMIN",
  });
  console.log(`Super admin: ${superAdmin.email}`);

  await upsertUser({
    email: "owner@studio-example.local",
    password: DEFAULT_PASSWORD,
    firstName: "Selma",
    lastName: "Hodžić",
  });
  await upsertUser({
    email: "admin@studio-example.local",
    password: DEFAULT_PASSWORD,
    firstName: "Amir",
    lastName: "Begić",
  });
  await upsertUser({
    email: "owner@barber-bros.local",
    password: DEFAULT_PASSWORD,
    firstName: "Dino",
    lastName: "Kovač",
  });

  const studio = await upsertSalon({
    slug: "studio-example",
    name: "Studio Example",
    audience: "UNISEX",
    profile: {
      description:
        "Moderan frizerski studio u centru Sarajeva. Šišanje, bojenje, styling i njega brade za muškarce i žene.\nRadimo isključivo po zakazanom terminu.",
      category: "hair-salon",
      address: "Ferhadija 12",
      city: "Sarajevo",
      postalCode: "71000",
      country: "BA",
      phone: "+387 33 123 456",
      email: "info@studio-example.local",
      website: "https://studio-example.local",
      instagram: "https://instagram.com/studio.example",
    },
    hours: [
      { weekday: 0, isClosed: false, opensAt: "09:00", closesAt: "19:00" },
      { weekday: 1, isClosed: false, opensAt: "09:00", closesAt: "19:00" },
      { weekday: 2, isClosed: false, opensAt: "09:00", closesAt: "19:00" },
      { weekday: 3, isClosed: false, opensAt: "09:00", closesAt: "19:00" },
      { weekday: 4, isClosed: false, opensAt: "09:00", closesAt: "19:00" },
      { weekday: 5, isClosed: false, opensAt: "09:00", closesAt: "15:00" },
      { weekday: 6, isClosed: true, opensAt: "09:00", closesAt: "15:00" },
    ],
    members: [
      { email: "owner@studio-example.local", role: "OWNER" },
      { email: "admin@studio-example.local", role: "ADMIN" },
    ],
  });
  const barber = await upsertSalon({
    slug: "barber-bros",
    name: "Barber Bros",
    audience: "MALE",
    profile: {
      description:
        "Klasični barbershop: šišanje mašinicom i makazama, brijanje toplim peškirom, oblikovanje brade.",
      category: "barbershop",
      address: "Zmaja od Bosne 4",
      city: "Sarajevo",
      postalCode: "71000",
      country: "BA",
      phone: "+387 61 222 333",
      email: "hello@barber-bros.local",
    },
    members: [{ email: "owner@barber-bros.local", role: "OWNER" }],
  });
  console.log(`Salons: ${studio.slug}, ${barber.slug}`);

  await prisma.platformSetting.upsert({
    where: { key: "seed.version" },
    update: { value: { version: 4 } },
    create: { key: "seed.version", value: { version: 4 } },
  });

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
