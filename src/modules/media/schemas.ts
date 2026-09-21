import { z } from "zod";

export const IMAGE_PURPOSES = [
  "LOGO",
  "COVER",
  "GALLERY",
  "SERVICE",
  "EMPLOYEE",
  "AVATAR",
] as const;

export const imagePurposeSchema = z.enum(IMAGE_PURPOSES);

export const uploadImageFieldsSchema = z.object({
  purpose: imagePurposeSchema,
  altText: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});
export type UploadImageFields = z.infer<typeof uploadImageFieldsSchema>;

/** Optional reference to an image id coming from a form (empty string = none). */
export const imageRefSchema = z
  .union([z.uuid(), z.literal(""), z.null()])
  .transform((v) => (v ? v : null))
  .optional();

export const galleryAddSchema = z.object({
  imageId: z.uuid(),
  caption: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});
export type GalleryAddInput = z.infer<typeof galleryAddSchema>;

export const galleryReorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200) });

export const galleryUpdateSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const galleryRemoveQuerySchema = z.object({
  deleteImage: z.enum(["true", "false"]).optional(),
});

export const listImagesQuerySchema = z.object({ purpose: imagePurposeSchema.optional() });
