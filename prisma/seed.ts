/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Grows phase by phase (see docs/setup.md §10).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";

import { PrismaClient } from "../src/generated/prisma/client";
import type { Audience, SalonRole } from "../src/generated/prisma/enums";

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
  members: { email: string; role: SalonRole }[];
};

async function upsertSalon(input: SeedSalon) {
  const salon = await prisma.salon.upsert({
    where: { slug: input.slug },
    update: { name: input.name, audience: input.audience, status: "ACTIVE" },
    create: { slug: input.slug, name: input.name, audience: input.audience },
  });

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
    members: [
      { email: "owner@studio-example.local", role: "OWNER" },
      { email: "admin@studio-example.local", role: "ADMIN" },
    ],
  });
  const barber = await upsertSalon({
    slug: "barber-bros",
    name: "Barber Bros",
    audience: "MALE",
    members: [{ email: "owner@barber-bros.local", role: "OWNER" }],
  });
  console.log(`Salons: ${studio.slug}, ${barber.slug}`);

  await prisma.platformSetting.upsert({
    where: { key: "seed.version" },
    update: { value: { version: 3 } },
    create: { key: "seed.version", value: { version: 3 } },
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
