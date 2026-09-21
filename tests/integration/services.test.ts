import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnectPrisma, prisma } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth/types";
import { createEmployee } from "@/modules/employees";
import { createSalon, getPublicSalon } from "@/modules/salons";
import {
  createCategory,
  createService,
  deleteCategory,
  deleteService,
  getService,
  listCategories,
  listServices,
  listServicesForEmployee,
  reorderServices,
  setServiceActive,
  updateService,
} from "@/modules/services";
import { resolveTenantContext, type TenantContext } from "@/modules/tenant";

const PREFIX = "svc-test";

async function makeActor(label: string): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@svc.local`,
      name: label,
      emailVerified: true,
    },
  });
  return {
    kind: "user",
    userId: user.id,
    email: user.email,
    name: user.name,
    emailVerified: true,
    isActive: true,
    locale: "bs",
    platformRole: null,
    memberships: [],
  };
}

const employee = {
  firstName: "Marko",
  lastName: "M",
  position: null,
  bio: null,
  email: null,
  phone: null,
  audience: "UNISEX" as const,
  color: null,
  isActive: true,
  isBookableOnline: true,
};
const service = {
  name: "Haircut",
  description: null,
  categoryId: null,
  priceCents: 2000,
  durationMinutes: 30,
  bufferAfterMinutes: 0,
  audience: "UNISEX" as const,
  isActive: true,
  employeeIds: [] as string[],
};

describe("services", () => {
  let ctx: TenantContext;
  let slug: string;
  let markoId: string;

  beforeAll(async () => {
    await prisma.salon.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@svc.local" } } });
    const owner = await makeActor("owner");
    const salon = await createSalon(owner, {
      name: `${PREFIX} Salon`,
      audience: "UNISEX",
      timezone: "Europe/Sarajevo",
      currency: "BAM",
      defaultLocale: "bs",
    });
    slug = salon.slug;
    ctx = await resolveTenantContext(
      { ...owner, memberships: [{ salonId: salon.id, role: "OWNER", employeeId: null }] },
      { id: salon.id },
    );
    markoId = (await createEmployee(ctx, employee)).id;
  });

  afterAll(async () => {
    await prisma.salon.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@svc.local" } } });
    await disconnectPrisma();
  });

  it("manages categories with unique names", async () => {
    const hair = await createCategory(ctx, { name: "Hair" });
    await expect(createCategory(ctx, { name: "Hair" })).rejects.toBeInstanceOf(ConflictError);
    const beard = await createCategory(ctx, { name: "Beard" });
    expect((await listCategories(ctx)).map((c) => c.name)).toEqual(["Hair", "Beard"]);
    await deleteCategory(ctx, beard.id);
    expect((await listCategories(ctx)).map((c) => c.id)).toEqual([hair.id]);
  });

  it("creates services with the salon currency, providers and audits price changes", async () => {
    const [hair] = await listCategories(ctx);
    const haircut = await createService(ctx, {
      ...service,
      categoryId: hair!.id,
      employeeIds: [markoId],
    });
    expect(haircut).toMatchObject({
      currency: "BAM",
      priceCents: 2000,
      employeeIds: [markoId],
      sortOrder: 0,
    });

    const updated = await updateService(ctx, haircut.id, {
      ...service,
      categoryId: hair!.id,
      priceCents: 2500,
      employeeIds: [],
    });
    expect(updated.priceCents).toBe(2500);
    expect(updated.employeeIds).toEqual([]);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: haircut.id, action: "service.priceChanged" },
    });
    expect(audit?.before).toMatchObject({ priceCents: 2000, employeeIds: [markoId] });
    expect(audit?.after).toMatchObject({ priceCents: 2500, employeeIds: [] });

    await updateService(ctx, haircut.id, {
      ...service,
      categoryId: hair!.id,
      priceCents: 2500,
      employeeIds: [markoId],
    });
    expect((await listServicesForEmployee(ctx, markoId)).map((s) => s.id)).toEqual([haircut.id]);
  });

  it("rejects foreign employees and categories", async () => {
    await expect(
      createService(ctx, { ...service, employeeIds: ["01a0c38b-af6c-717d-a8c8-68fae1987aaf"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createService(ctx, { ...service, categoryId: "01a0c38b-af6c-717d-a8c8-68fae1987aaf" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("reorders, deactivates, deletes and exposes only active services publicly", async () => {
    const beard = await createService(ctx, {
      ...service,
      name: "Beard Trim",
      priceCents: 1000,
      durationMinutes: 15,
      audience: "MALE",
    });
    const styling = await createService(ctx, {
      ...service,
      name: "Styling",
      priceCents: 2500,
      durationMinutes: 45,
    });
    const [haircut] = await listServices(ctx);
    await reorderServices(ctx, [styling.id, beard.id, haircut!.id]);
    expect((await listServices(ctx)).map((s) => s.name)).toEqual([
      "Styling",
      "Beard Trim",
      "Haircut",
    ]);
    await expect(reorderServices(ctx, [styling.id])).rejects.toBeInstanceOf(ValidationError);

    await setServiceActive(ctx, styling.id, false);
    expect((await listServices(ctx)).map((s) => s.name)).toEqual(["Beard Trim", "Haircut"]);
    const pub = await getPublicSalon(slug, "2026-01-01");
    expect(pub?.services.map((s) => s.name)).toEqual(["Beard Trim", "Haircut"]);
    expect(pub?.services.find((s) => s.name === "Haircut")?.employeeIds).toEqual([markoId]);
    expect(pub?.categories.map((c) => c.name)).toEqual(["Hair"]);

    await deleteService(ctx, beard.id);
    await expect(getService(ctx, beard.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("isolates tenants and enforces permissions", async () => {
    const other = await makeActor("other");
    const otherSalon = await createSalon(other, {
      name: `${PREFIX} Other`,
      audience: "UNISEX",
      timezone: "Europe/Sarajevo",
      currency: "EUR",
      defaultLocale: "bs",
    });
    const otherCtx = await resolveTenantContext(
      { ...other, memberships: [{ salonId: otherSalon.id, role: "OWNER", employeeId: null }] },
      { id: otherSalon.id },
    );
    expect(await listServices(otherCtx)).toHaveLength(0);
    const [haircut] = await listServices(ctx);
    await expect(getService(otherCtx, haircut!.id)).rejects.toBeInstanceOf(NotFoundError);
    // Assigning another salon's employee is rejected.
    await expect(
      createService(otherCtx, { ...service, employeeIds: [markoId] }),
    ).rejects.toBeInstanceOf(ValidationError);
    const eur = await createService(otherCtx, { ...service, name: "Cut" });
    expect(eur.currency).toBe("EUR");

    const staff = await makeActor("staff");
    const staffCtx = await resolveTenantContext(
      { ...staff, memberships: [{ salonId: ctx.salonId, role: "EMPLOYEE", employeeId: markoId }] },
      { id: ctx.salonId },
    );
    await expect(createService(staffCtx, service)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listServices(staffCtx)).length).toBeGreaterThan(0);
  });
});
