import type { VariantName } from "@/modules/media/pipeline";
import type { StorageProvider } from "@/modules/media/storage/types";

export type ImagePurpose = "LOGO" | "COVER" | "GALLERY" | "SERVICE" | "EMPLOYEE" | "AVATAR";

export type StoredVariant = { key: string; width: number; height: number; bytes: number };
export type StoredVariants = Record<VariantName, StoredVariant>;

export type ImageVariantView = { url: string; width: number; height: number };

/** What the web app and API hand to browsers. */
export type ImageView = {
  id: string;
  purpose: ImagePurpose;
  altText: string | null;
  width: number;
  height: number;
  placeholder: string | null;
  variants: Record<VariantName, ImageVariantView>;
};

export type ImageRow = {
  id: string;
  purpose: ImagePurpose;
  altText: string | null;
  width: number;
  height: number;
  placeholder: string | null;
  variants: unknown;
};

export const imageSelect = {
  id: true,
  purpose: true,
  altText: true,
  width: true,
  height: true,
  placeholder: true,
  variants: true,
} as const;

export function toImageView(row: ImageRow, storage: StorageProvider): ImageView {
  const stored = row.variants as StoredVariants;
  const variants = {} as Record<VariantName, ImageVariantView>;
  for (const name of ["thumb", "md", "lg", "orig"] as const) {
    const v = stored[name];
    variants[name] = { url: storage.publicUrl(v.key), width: v.width, height: v.height };
  }
  return {
    id: row.id,
    purpose: row.purpose,
    altText: row.altText,
    width: row.width,
    height: row.height,
    placeholder: row.placeholder,
    variants,
  };
}
