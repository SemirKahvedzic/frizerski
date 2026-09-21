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

type SeedEmployee = {
  key: string;
  firstName: string;
  lastName: string;
  position: string;
  bio: string | null;
  audience: Audience;
  color: string;
  email?: string;
  schedule: {
    weekday: number;
    startTime: string;
    endTime: string;
    breaks: { startTime: string; endTime: string; label: string }[];
  }[];
};

/** Employees are keyed by (salonId, email or synthetic key) so re-running the seed updates them. */
async function upsertEmployees(salonId: string, employees: SeedEmployee[]) {
  for (const e of employees) {
    const email = e.email ?? `${e.key}@seed.local`;
    const existing = await prisma.employee.findFirst({ where: { salonId, email } });
    const data = {
      firstName: e.firstName,
      lastName: e.lastName,
      position: e.position,
      bio: e.bio,
      audience: e.audience,
      color: e.color,
      email,
      isActive: true,
      isBookableOnline: true,
    };
    const employee = existing
      ? await prisma.employee.update({ where: { id: existing.id }, data })
      : await prisma.employee.create({ data: { salonId, ...data } });

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.employee.update({ where: { id: employee.id }, data: { userId: user.id } });
      await prisma.salonMembership.upsert({
        where: { userId_salonId: { userId: user.id, salonId } },
        update: { employeeId: employee.id },
        create: { userId: user.id, salonId, role: "EMPLOYEE", employeeId: employee.id },
      });
    }

    await prisma.employeeSchedule.deleteMany({
      where: { salonId, employeeId: employee.id, validFrom: null, validUntil: null },
    });
    for (const block of e.schedule) {
      await prisma.employeeSchedule.create({
        data: {
          salonId,
          employeeId: employee.id,
          weekday: block.weekday,
          startTime: block.startTime,
          endTime: block.endTime,
          breaks: { create: block.breaks },
        },
      });
    }
  }
}

type SeedService = {
  category: string;
  name: string;
  description: string | null;
  priceCents: number;
  durationMinutes: number;
  audience: Audience;
  /** Employee keys (seed email local part) or full emails. */
  providers: string[];
};

async function upsertServices(salonId: string, currency: string, services: SeedService[]) {
  const employees = await prisma.employee.findMany({
    where: { salonId },
    select: { id: true, email: true },
  });
  const employeeByKey = (key: string) =>
    employees.find(
      (e) =>
        e.email === key ||
        e.email === `${key}@seed.local` ||
        e.email === `${key}@studio-example.local`,
    );

  let categoryOrder = 0;
  const categoryIds = new Map<string, string>();
  for (const name of [...new Set(services.map((s) => s.category))]) {
    const category = await prisma.serviceCategory.upsert({
      where: { salonId_name: { salonId, name } },
      update: { sortOrder: categoryOrder },
      create: { salonId, name, sortOrder: categoryOrder },
    });
    categoryIds.set(name, category.id);
    categoryOrder += 1;
  }

  let order = 0;
  for (const s of services) {
    const existing = await prisma.service.findFirst({ where: { salonId, name: s.name } });
    const data = {
      categoryId: categoryIds.get(s.category) ?? null,
      name: s.name,
      description: s.description,
      priceCents: s.priceCents,
      currency,
      durationMinutes: s.durationMinutes,
      audience: s.audience,
      isActive: true,
      sortOrder: order,
    };
    const service = existing
      ? await prisma.service.update({ where: { id: existing.id }, data })
      : await prisma.service.create({ data: { salonId, ...data } });
    order += 1;

    const providerIds = s.providers
      .map((p) => employeeByKey(p)?.id)
      .filter((id): id is string => Boolean(id));
    await prisma.employeeService.deleteMany({
      where: { serviceId: service.id, employeeId: { notIn: providerIds } },
    });
    for (const employeeId of providerIds) {
      await prisma.employeeService.upsert({
        where: { employeeId_serviceId: { employeeId, serviceId: service.id } },
        update: {},
        create: { salonId, employeeId, serviceId: service.id },
      });
    }
  }
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
    email: "marko@studio-example.local",
    password: DEFAULT_PASSWORD,
    firstName: "Marko",
    lastName: "Marić",
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
  // Only the platform E2E test touches this salon's status.
  await upsertSalon({
    slug: "status-demo",
    name: "Status Demo",
    audience: "UNISEX",
    profile: {
      description: "Demo salon used to exercise platform status changes.",
      category: "other",
      address: "Demo 1",
      city: "Sarajevo",
      postalCode: "71000",
      country: "BA",
      phone: "+387 00 000 000",
      email: "demo@status-demo.local",
    },
    members: [{ email: "owner@barber-bros.local", role: "OWNER" }],
  });
  console.log(`Salons: ${studio.slug}, ${barber.slug}, status-demo`);

  await upsertEmployees(studio.id, [
    {
      key: "marko",
      firstName: "Marko",
      lastName: "Marić",
      position: "Senior frizer",
      bio: "15 godina iskustva, specijalista za muška šišanja i brade.",
      audience: "MALE",
      color: "#2563eb",
      email: "marko@studio-example.local",
      schedule: [
        {
          weekday: 0,
          startTime: "09:00",
          endTime: "17:00",
          breaks: [{ startTime: "13:00", endTime: "13:30", label: "Ručak" }],
        },
        {
          weekday: 1,
          startTime: "09:00",
          endTime: "17:00",
          breaks: [{ startTime: "13:00", endTime: "13:30", label: "Ručak" }],
        },
        { weekday: 3, startTime: "12:00", endTime: "19:00", breaks: [] },
        {
          weekday: 4,
          startTime: "09:00",
          endTime: "17:00",
          breaks: [{ startTime: "13:00", endTime: "13:30", label: "Ručak" }],
        },
        { weekday: 5, startTime: "09:00", endTime: "14:00", breaks: [] },
      ],
    },
    {
      key: "ana",
      firstName: "Ana",
      lastName: "Anić",
      position: "Stilistica i kolorista",
      bio: "Bojenje, balayage i svečane frizure.",
      audience: "FEMALE",
      color: "#db2777",
      schedule: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: weekday === 5 ? "15:00" : "18:00",
        breaks: [],
      })),
    },
    {
      key: "sara",
      firstName: "Sara",
      lastName: "Sarić",
      position: "Frizerka",
      bio: null,
      audience: "UNISEX",
      color: "#0f766e",
      schedule: [0, 1, 2, 3, 4].map((weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: "15:00",
        breaks: [],
      })),
    },
  ]);
  await upsertEmployees(barber.id, [
    {
      key: "dino",
      firstName: "Dino",
      lastName: "Kovač",
      position: "Barber",
      bio: null,
      audience: "MALE",
      color: "#475569",
      email: "owner@barber-bros.local",
      schedule: [0, 1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: weekday === 5 ? "14:00" : "17:00",
        breaks: [],
      })),
    },
  ]);
  console.log("Employees seeded.");

  await upsertServices(studio.id, "BAM", [
    {
      category: "Kosa",
      name: "Šišanje",
      description: "Konsultacija, pranje, šišanje i styling.",
      priceCents: 2000,
      durationMinutes: 30,
      audience: "UNISEX",
      providers: ["marko", "ana", "sara"],
    },
    {
      category: "Brada",
      name: "Uređivanje brade",
      description: null,
      priceCents: 1000,
      durationMinutes: 15,
      audience: "MALE",
      providers: ["marko"],
    },
    {
      category: "Kosa",
      name: "Styling",
      description: "Feniranje i oblikovanje.",
      priceCents: 2500,
      durationMinutes: 45,
      audience: "FEMALE",
      providers: ["ana", "sara"],
    },
    {
      category: "Kosa",
      name: "Bojenje",
      description: "Cijena za srednju dužinu kose.",
      priceCents: 6000,
      durationMinutes: 120,
      audience: "FEMALE",
      providers: ["ana"],
    },
  ]);
  await upsertServices(barber.id, "BAM", [
    {
      category: "Barber",
      name: "Šišanje",
      description: null,
      priceCents: 1500,
      durationMinutes: 30,
      audience: "MALE",
      providers: ["owner@barber-bros.local"],
    },
    {
      category: "Barber",
      name: "Brada",
      description: "Oblikovanje i brijanje toplim peškirom.",
      priceCents: 1000,
      durationMinutes: 15,
      audience: "MALE",
      providers: ["owner@barber-bros.local"],
    },
  ]);
  console.log("Services seeded.");

  await prisma.platformSetting.upsert({
    where: { key: "seed.version" },
    update: { value: { version: 6 } },
    create: { key: "seed.version", value: { version: 6 } },
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
