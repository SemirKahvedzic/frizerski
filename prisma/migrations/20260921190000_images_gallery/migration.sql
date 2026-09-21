-- CreateEnum
CREATE TYPE "ImagePurpose" AS ENUM ('LOGO', 'COVER', 'GALLERY', 'SERVICE', 'EMPLOYEE', 'AVATAR');

-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "avatar_image_id" TEXT;

-- AlterTable
ALTER TABLE "salons" ADD COLUMN     "cover_image_id" TEXT,
ADD COLUMN     "logo_image_id" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "image_id" TEXT;

-- CreateTable
CREATE TABLE "images" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "purpose" "ImagePurpose" NOT NULL,
    "storage_key_prefix" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "variants" JSONB NOT NULL,
    "placeholder" TEXT,
    "alt_text" TEXT,
    "status" "ImageStatus" NOT NULL DEFAULT 'READY',
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_images" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "image_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "images_salon_id_purpose_idx" ON "images"("salon_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "images_salon_id_id_key" ON "images"("salon_id", "id");

-- CreateIndex
CREATE INDEX "gallery_images_salon_id_sort_order_idx" ON "gallery_images"("salon_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_images_salon_id_image_id_key" ON "gallery_images"("salon_id", "image_id");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_images_salon_id_id_key" ON "gallery_images"("salon_id", "id");

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_salon_id_image_id_fkey" FOREIGN KEY ("salon_id", "image_id") REFERENCES "images"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tenant-safe image references: the referenced image must belong to the same salon.
-- Postgres 15+ column list keeps the tenant column intact when the image is deleted.
ALTER TABLE "salons" ADD CONSTRAINT "salons_logo_image_fkey"
  FOREIGN KEY ("id", "logo_image_id") REFERENCES "images"("salon_id", "id")
  ON DELETE SET NULL ("logo_image_id") ON UPDATE CASCADE;
ALTER TABLE "salons" ADD CONSTRAINT "salons_cover_image_fkey"
  FOREIGN KEY ("id", "cover_image_id") REFERENCES "images"("salon_id", "id")
  ON DELETE SET NULL ("cover_image_id") ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_avatar_image_fkey"
  FOREIGN KEY ("salon_id", "avatar_image_id") REFERENCES "images"("salon_id", "id")
  ON DELETE SET NULL ("avatar_image_id") ON UPDATE CASCADE;
ALTER TABLE "services" ADD CONSTRAINT "services_image_fkey"
  FOREIGN KEY ("salon_id", "image_id") REFERENCES "images"("salon_id", "id")
  ON DELETE SET NULL ("image_id") ON UPDATE CASCADE;
