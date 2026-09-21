/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Grows phase by phase (see docs/setup.md §10).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";

import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

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

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      firstName: input.firstName,
      lastName: input.lastName,
      locale: input.locale ?? "bs",
      platformRole: input.platformRole ?? null,
      emailVerified: true,
      isActive: true,
    },
    create: {
      email,
      name,
      firstName: input.firstName,
      lastName: input.lastName,
      locale: input.locale ?? "bs",
      platformRole: input.platformRole ?? null,
      emailVerified: true,
      isActive: true,
    },
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

async function main() {
  const superAdmin = await upsertUser({
    email: process.env["SEED_SUPER_ADMIN_EMAIL"] ?? "admin@platform.local",
    password: process.env["SEED_SUPER_ADMIN_PASSWORD"] ?? "Admin12345!",
    firstName: "Platform",
    lastName: "Admin",
    platformRole: "SUPER_ADMIN",
  });
  console.log(`Super admin: ${superAdmin.email}`);

  await prisma.platformSetting.upsert({
    where: { key: "seed.version" },
    update: { value: { version: 2 } },
    create: { key: "seed.version", value: { version: 2 } },
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
