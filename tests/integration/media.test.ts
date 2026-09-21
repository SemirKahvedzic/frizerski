import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnectPrisma, prisma } from "@/lib/db";
import { ConflictError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth/types";
import {
  FakeStorageProvider,
  addToGallery,
  deleteImage,
  getPublicGallery,
  getStorageProvider,
  listGallery,
  removeFromGallery,
  reorderGallery,
  updateGalleryItem,
  uploadImage,
} from "@/modules/media";
import { createSalon, getPublicSalon, getSalonProfile, updateSalonProfile } from "@/modules/salons";
import { resolveTenantContext, type TenantContext } from "@/modules/tenant";

const PREFIX = "media-test";

async function makeActor(label: string): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@media.local`,
      name: `${label} User`,
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
    locale: "en",
    platformRole: null,
    memberships: [],
  };
}

async function png(width = 640, height = 480): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#3366cc" } })
    .png()
    .toBuffer();
}

async function ownerContext(label: string) {
  const owner = await makeActor(label);
  const salon = await createSalon(owner, {
    name: `${PREFIX} ${label}`,
    audience: "UNISEX",
    timezone: "Europe/Sarajevo",
    currency: "BAM",
    defaultLocale: "bs",
  });
  const ctx = await resolveTenantContext(
    { ...owner, memberships: [{ salonId: salon.id, role: "OWNER", employeeId: null }] },
    { id: salon.id },
  );
  return { ctx, slug: salon.slug };
}

describe("media module", () => {
  let ctx: TenantContext;
  let slug: string;
  let otherCtx: TenantContext;
  const storage = getStorageProvider() as FakeStorageProvider;

  beforeAll(async () => {
    ({ ctx, slug } = await ownerContext("salon"));
    ({ ctx: otherCtx } = await ownerContext("other"));
  });

  afterAll(async () => {
    await prisma.salon.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await disconnectPrisma();
  });

  it("uploads an image, stores four variants and exposes URLs", async () => {
    const image = await uploadImage(ctx, {
      purpose: "LOGO",
      fileName: "logo.png",
      buffer: await png(500, 500),
    });
    expect(image.purpose).toBe("LOGO");
    expect(image.variants.thumb.width).toBe(320);
    expect(image.variants.orig.width).toBe(500);
    expect(image.variants.md.url).toMatch(/^\/api\/v1\/media\/salons\//);
    const keys = storage.keysWithPrefix(`salons/${ctx.salonId}/logo/${image.id}/`);
    expect(keys).toHaveLength(4);
    const row = await prisma.image.findUniqueOrThrow({ where: { id: image.id } });
    expect(row.salonId).toBe(ctx.salonId);
    expect(row.placeholder).toContain("data:image/webp");
  });

  it("sets the logo on the profile and rejects images of another salon", async () => {
    const logo = await uploadImage(ctx, {
      purpose: "LOGO",
      fileName: "l.png",
      buffer: await png(400, 400),
    });
    const foreign = await uploadImage(otherCtx, {
      purpose: "LOGO",
      fileName: "x.png",
      buffer: await png(400, 400),
    });
    const profile = await getSalonProfile(ctx);
    const base = {
      name: profile.name,
      audience: profile.audience,
      defaultLocale: "bs" as const,
      logoImageId: logo.id,
      coverImageId: null,
    };
    const updated = await updateSalonProfile(ctx, base);
    expect(updated.logoImageId).toBe(logo.id);

    await expect(
      updateSalonProfile(ctx, { ...base, logoImageId: foreign.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Purpose must match the slot.
    const gallery = await uploadImage(ctx, {
      purpose: "GALLERY",
      fileName: "g.png",
      buffer: await png(),
    });
    await expect(
      updateSalonProfile(ctx, { ...base, coverImageId: gallery.id }),
    ).rejects.toBeInstanceOf(ValidationError);

    const publicView = await getPublicSalon(slug, "2026-01-01");
    expect(publicView?.logo?.id).toBe(logo.id);

    // Deleting the logo clears the reference and the objects.
    await deleteImage(ctx, logo.id);
    expect((await getSalonProfile(ctx)).logoImageId).toBeNull();
    expect(storage.keysWithPrefix(`salons/${ctx.salonId}/logo/${logo.id}/`)).toHaveLength(0);
  });

  it("manages the gallery: add, reorder, caption, remove, public order", async () => {
    const a = await uploadImage(ctx, {
      purpose: "GALLERY",
      fileName: "a.png",
      buffer: await png(800, 600),
    });
    const b = await uploadImage(ctx, {
      purpose: "GALLERY",
      fileName: "b.png",
      buffer: await png(800, 600),
    });
    const logo = await uploadImage(ctx, {
      purpose: "LOGO",
      fileName: "l.png",
      buffer: await png(300, 300),
    });

    const itemA = await addToGallery(ctx, { imageId: a.id, caption: "First" });
    const itemB = await addToGallery(ctx, { imageId: b.id, caption: null });
    expect(itemB.sortOrder).toBe(itemA.sortOrder + 1);
    await expect(addToGallery(ctx, { imageId: a.id, caption: null })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(addToGallery(ctx, { imageId: logo.id, caption: null })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(addToGallery(otherCtx, { imageId: a.id, caption: null })).rejects.toThrow();

    const reordered = await reorderGallery(ctx, [itemB.id, itemA.id]);
    expect(reordered.map((i) => i.id)).toEqual([itemB.id, itemA.id]);
    await expect(reorderGallery(ctx, [itemA.id])).rejects.toBeInstanceOf(ValidationError);

    const captioned = await updateGalleryItem(ctx, itemB.id, { caption: "Second" });
    expect(captioned.caption).toBe("Second");

    const publicGallery = await getPublicGallery(slug);
    expect(publicGallery.map((g) => g.caption)).toEqual(["Second", "First"]);
    expect(publicGallery[0]!.image.variants.md.url).toContain("/api/v1/media/");

    await removeFromGallery(ctx, itemA.id, { deleteImage: true });
    expect(await prisma.image.count({ where: { id: a.id } })).toBe(0);
    await removeFromGallery(ctx, itemB.id);
    expect(await prisma.image.count({ where: { id: b.id } })).toBe(1); // image kept
    expect(await listGallery(ctx)).toHaveLength(0);
  });
});
