import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit";
import { authorize } from "@/modules/auth/authorize";
import { imageSelect, toImageView, type ImageView } from "@/modules/media/image-view";
import { deleteImage } from "@/modules/media/media.service";
import type { GalleryAddInput } from "@/modules/media/schemas";
import { getStorageProvider } from "@/modules/media/storage";
import type { TenantContext } from "@/modules/tenant/context";

export type GalleryItemView = {
  id: string;
  imageId: string;
  caption: string | null;
  sortOrder: number;
  image: ImageView;
};

const gallerySelect = {
  id: true,
  imageId: true,
  caption: true,
  sortOrder: true,
  image: { select: imageSelect },
} as const;

type GalleryRow = {
  id: string;
  imageId: string;
  caption: string | null;
  sortOrder: number;
  image: Parameters<typeof toImageView>[0];
};

function toItem(row: GalleryRow): GalleryItemView {
  const storage = getStorageProvider();
  return {
    id: row.id,
    imageId: row.imageId,
    caption: row.caption,
    sortOrder: row.sortOrder,
    image: toImageView(row.image, storage),
  };
}

export async function listGallery(ctx: TenantContext): Promise<GalleryItemView[]> {
  authorize(ctx.actor, "salon.read", { salonId: ctx.salonId });
  const rows = await ctx.db.galleryImage.findMany({
    where: { salonId: ctx.salonId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: gallerySelect,
  });
  return rows.map(toItem);
}

export async function addToGallery(
  ctx: TenantContext,
  input: GalleryAddInput,
): Promise<GalleryItemView> {
  authorize(ctx.actor, "salon.update", { salonId: ctx.salonId });
  const image = await ctx.db.image.findFirst({
    where: { id: input.imageId, salonId: ctx.salonId },
    select: { id: true, purpose: true },
  });
  if (!image) throw new NotFoundError("Image");
  if (image.purpose !== "GALLERY") {
    throw new ValidationError("Only gallery images can be added to the gallery.", {
      where: "body",
      field: "imageId",
    });
  }
  const existing = await ctx.db.galleryImage.count({
    where: { salonId: ctx.salonId, imageId: image.id },
  });
  if (existing > 0) throw new ConflictError("Image is already in the gallery.");

  return prisma.$transaction(async (tx) => {
    const last = await tx.galleryImage.findFirst({
      where: { salonId: ctx.salonId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const row = await tx.galleryImage.create({
      data: {
        salonId: ctx.salonId,
        imageId: image.id,
        caption: input.caption ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: gallerySelect,
    });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "gallery.added",
      entityType: "GalleryImage",
      entityId: row.id,
      after: { imageId: image.id, caption: input.caption ?? null },
      request: ctx.request,
    });
    return toItem(row);
  });
}

export async function reorderGallery(
  ctx: TenantContext,
  ids: string[],
): Promise<GalleryItemView[]> {
  authorize(ctx.actor, "salon.update", { salonId: ctx.salonId });
  const rows = await ctx.db.galleryImage.findMany({
    where: { salonId: ctx.salonId },
    select: { id: true },
  });
  const known = new Set(rows.map((r) => r.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
    throw new ValidationError("Reorder must list every gallery item exactly once.", {
      where: "body",
      field: "ids",
    });
  }
  await prisma.$transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.galleryImage.update({ where: { id }, data: { sortOrder: index } });
    }
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "gallery.reordered",
      entityType: "GalleryImage",
      entityId: ctx.salonId,
      after: { ids },
      request: ctx.request,
    });
  });
  return listGallery(ctx);
}

export async function updateGalleryItem(
  ctx: TenantContext,
  galleryId: string,
  input: { caption: string | null },
): Promise<GalleryItemView> {
  authorize(ctx.actor, "salon.update", { salonId: ctx.salonId });
  const row = await ctx.db.galleryImage.findFirst({
    where: { id: galleryId, salonId: ctx.salonId },
    select: { id: true },
  });
  if (!row) throw new NotFoundError("Gallery item");
  const updated = await ctx.db.galleryImage.update({
    where: { id: row.id },
    data: { caption: input.caption },
    select: gallerySelect,
  });
  return toItem(updated);
}

export async function removeFromGallery(
  ctx: TenantContext,
  galleryId: string,
  options: { deleteImage?: boolean } = {},
): Promise<void> {
  authorize(ctx.actor, "salon.update", { salonId: ctx.salonId });
  const row = await ctx.db.galleryImage.findFirst({
    where: { id: galleryId, salonId: ctx.salonId },
    select: { id: true, imageId: true },
  });
  if (!row) throw new NotFoundError("Gallery item");
  if (options.deleteImage) {
    await deleteImage(ctx, row.imageId); // cascades to the gallery row
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.galleryImage.delete({ where: { id: row.id } });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "gallery.removed",
      entityType: "GalleryImage",
      entityId: row.id,
      before: { imageId: row.imageId },
      request: ctx.request,
    });
  });
}

export type PublicGalleryItem = { id: string; caption: string | null; image: ImageView };

/** Public gallery for `/salon/[slug]` (ACTIVE salons only). */
export async function getPublicGallery(slug: string): Promise<PublicGalleryItem[]> {
  const rows = await prisma.galleryImage.findMany({
    where: { salon: { slug, status: "ACTIVE" } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 60,
    select: gallerySelect,
  });
  return rows.map((r) => {
    const item = toItem(r);
    return { id: item.id, caption: item.caption, image: item.image };
  });
}
