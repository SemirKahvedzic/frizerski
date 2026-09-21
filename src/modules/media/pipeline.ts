import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { UnsupportedMediaTypeError, ValidationError } from "@/lib/errors";

/**
 * Image processing (docs/architecture.md §9): validate by magic bytes,
 * decode with sharp (auto-rotate, strip metadata), emit WebP variants and a
 * tiny inline placeholder. Pure with respect to storage and the database.
 */
export const VARIANT_NAMES = ["thumb", "md", "lg", "orig"] as const;
export type VariantName = (typeof VARIANT_NAMES)[number];

export const VARIANT_MAX_EDGE: Record<VariantName, number> = {
  thumb: 320,
  md: 800,
  lg: 1600,
  orig: 2400,
};

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/gif",
]);

export const MAX_SOURCE_EDGE = 8000;

export type ProcessedVariant = { buffer: Buffer; width: number; height: number; bytes: number };

export type ProcessedImage = {
  mimeType: string;
  width: number;
  height: number;
  variants: Record<VariantName, ProcessedVariant>;
  /** `data:image/webp;base64,...` of a ~16px preview for blur-up placeholders. */
  placeholder: string;
};

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const detected = await fileTypeFromBuffer(input);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new UnsupportedMediaTypeError([...ALLOWED_MIME_TYPES]);
  }

  const source = sharp(input, {
    limitInputPixels: MAX_SOURCE_EDGE * MAX_SOURCE_EDGE,
    animated: false,
  })
    .rotate()
    .withMetadata({ orientation: undefined });
  const meta = await source.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0)
    throw new ValidationError("Image has no dimensions.", { where: "body" });
  if (width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE) {
    throw new ValidationError(`Image is larger than ${MAX_SOURCE_EDGE}px on one side.`, {
      where: "body",
    });
  }

  const variants = {} as Record<VariantName, ProcessedVariant>;
  for (const name of VARIANT_NAMES) {
    const max = VARIANT_MAX_EDGE[name];
    const { data, info } = await source
      .clone()
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    variants[name] = { buffer: data, width: info.width, height: info.height, bytes: data.length };
  }

  const tiny = await source
    .clone()
    .resize({ width: 16, height: 16, fit: "inside" })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    mimeType: detected.mime,
    width,
    height,
    variants,
    placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
  };
}

export function imageKeyPrefix(salonId: string, purpose: string, imageId: string): string {
  return `salons/${salonId}/${purpose.toLowerCase()}/${imageId}/`;
}

export function variantKey(prefix: string, variant: VariantName): string {
  return `${prefix}${variant}.webp`;
}
