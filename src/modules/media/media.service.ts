import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { NotFoundError, PayloadTooLargeError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/modules/audit";
import { authorize } from "@/modules/auth/authorize";
import {
  imageSelect,
  toImageView,
  type ImagePurpose,
  type ImageView,
  type StoredVariants,
} from "@/modules/media/image-view";
import { imageKeyPrefix, processImage, variantKey, VARIANT_NAMES } from "@/modules/media/pipeline";
import { getStorageProvider } from "@/modules/media/storage";
import type { TenantContext } from "@/modules/tenant/context";

const log = logger.child({ module: "media" });

export type UploadImageInput = {
  purpose: ImagePurpose;
  fileName: string;
  buffer: Buffer;
  altText?: string | null;
};

/**
 * Full upload pipeline: size check → decode/validate → variants → storage →
 * `Image` row (+ audit). Objects are written before the row so a failed
 * insert can never leave a row without files; a failed upload leaves at
 * most a few orphaned objects under a prefix nobody references.
 */
export async function uploadImage(ctx: TenantContext, input: UploadImageInput): Promise<ImageView> {
  authorize(ctx.actor, "salon.update", { salonId: ctx.salonId });
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (input.buffer.length === 0)
    throw new ValidationError("Empty file.", { where: "body", field: "file" });
  if (input.buffer.length > maxBytes) {
    throw new PayloadTooLargeError(maxBytes);
  }

  const processed = await processImage(input.buffer);
  const storage = getStorageProvider();
  const imageId = randomUUID();
  const prefix = imageKeyPrefix(ctx.salonId, input.purpose, imageId);

  const stored = {} as StoredVariants;
  for (const name of VARIANT_NAMES) {
    const variant = processed.variants[name];
    const key = variantKey(prefix, name);
    await storage.putObject(key, variant.buffer, "image/webp");
    stored[name] = { key, width: variant.width, height: variant.height, bytes: variant.bytes };
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.image.create({
      data: {
        id: imageId,
        salonId: ctx.salonId,
        purpose: input.purpose,
        storageKeyPrefix: prefix,
        originalName: input.fileName.slice(0, 255),
        mimeType: processed.mimeType,
        sizeBytes: input.buffer.length,
        width: processed.width,
        height: processed.height,
        variants: stored as unknown as Prisma.InputJsonValue,
        placeholder: processed.placeholder,
        altText: input.altText ?? null,
        status: "READY",
        uploadedById: ctx.actor.kind === "user" ? ctx.actor.userId : null,
      },
      select: imageSelect,
    });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "image.uploaded",
      entityType: "Image",
      entityId: created.id,
      after: { purpose: input.purpose, originalName: input.fileName, bytes: input.buffer.length },
      request: ctx.request,
    });
    return created;
  });

  log.info(
    { salonId: ctx.salonId, imageId, purpose: input.purpose, bytes: input.buffer.length },
    "image.uploaded",
  );
  return toImageView(row, storage);
}

export async function listImages(
  ctx: TenantContext,
  options: { purpose?: ImagePurpose } = {},
): Promise<ImageView[]> {
  authorize(ctx.actor, "salon.read", { salonId: ctx.salonId });
  const storage = getStorageProvider();
  const rows = await ctx.db.image.findMany({
    where: { salonId: ctx.salonId, purpose: options.purpose },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: imageSelect,
  });
  return rows.map((r) => toImageView(r, storage));
}

export async function getImage(ctx: TenantContext, imageId: string): Promise<ImageView> {
  authorize(ctx.actor, "salon.read", { salonId: ctx.salonId });
  const row = await ctx.db.image.findFirst({
    where: { id: imageId, salonId: ctx.salonId },
    select: imageSelect,
  });
  if (!row) throw new NotFoundError("Image");
  return toImageView(row, getStorageProvider());
}

/**
 * Deletes an image, clears every reference to it (logo/cover, avatars,
 * service images; gallery rows cascade) and removes the stored objects.
 */
export async function deleteImage(ctx: TenantContext, imageId: string): Promise<void> {
  authorize(ctx.actor, "salon.update", { salonId: ctx.salonId });
  const row = await ctx.db.image.findFirst({
    where: { id: imageId, salonId: ctx.salonId },
    select: { id: true, purpose: true, storageKeyPrefix: true, originalName: true },
  });
  if (!row) throw new NotFoundError("Image");

  await prisma.$transaction(async (tx) => {
    await tx.salon.updateMany({
      where: { id: ctx.salonId, logoImageId: row.id },
      data: { logoImageId: null },
    });
    await tx.salon.updateMany({
      where: { id: ctx.salonId, coverImageId: row.id },
      data: { coverImageId: null },
    });
    await tx.employee.updateMany({
      where: { salonId: ctx.salonId, avatarImageId: row.id },
      data: { avatarImageId: null },
    });
    await tx.service.updateMany({
      where: { salonId: ctx.salonId, imageId: row.id },
      data: { imageId: null },
    });
    await tx.image.delete({ where: { id: row.id } });
    await recordAudit(tx, {
      salonId: ctx.salonId,
      actor: ctx.actor,
      action: "image.deleted",
      entityType: "Image",
      entityId: row.id,
      before: { purpose: row.purpose, originalName: row.originalName },
      request: ctx.request,
    });
  });

  try {
    await getStorageProvider().deletePrefix(row.storageKeyPrefix);
  } catch (error) {
    log.error({ err: error, imageId: row.id }, "failed to delete image objects");
  }
}

/**
 * Guards image references coming from forms: the image must exist, belong
 * to the salon and have one of the accepted purposes.
 */
export async function assertSalonImage(
  salonId: string,
  imageId: string,
  purposes: ImagePurpose[],
  field: string,
): Promise<void> {
  const found = await prisma.image.count({
    where: { id: imageId, salonId, purpose: { in: purposes } },
  });
  if (found === 0) {
    throw new ValidationError("Unknown image.", {
      where: "body",
      field,
      fieldErrors: { [field]: "media.validation.unknownImage" },
    });
  }
}

/** Resolves image views for ids belonging to one salon (missing ids are skipped). */
export async function loadImageViews(
  salonId: string,
  ids: (string | null | undefined)[],
): Promise<Map<string, ImageView>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  const storage = getStorageProvider();
  const rows = await prisma.image.findMany({
    where: { salonId, id: { in: wanted } },
    select: imageSelect,
  });
  return new Map(rows.map((r) => [r.id, toImageView(r, storage)]));
}

export async function imageViewsFor(
  ctx: TenantContext,
  ids: (string | null | undefined)[],
): Promise<Map<string, ImageView>> {
  return loadImageViews(ctx.salonId, ids);
}
