-- AlterTable
ALTER TABLE "salons" ADD COLUMN     "address" TEXT,
ADD COLUMN     "brand_color" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "google_maps_url" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "tiktok" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "salon_settings" (
    "salon_id" TEXT NOT NULL,
    "slot_interval_minutes" INTEGER NOT NULL DEFAULT 30,
    "min_booking_notice_minutes" INTEGER NOT NULL DEFAULT 60,
    "max_booking_advance_days" INTEGER NOT NULL DEFAULT 60,
    "cancellation_cutoff_hours" INTEGER NOT NULL DEFAULT 12,
    "reschedule_cutoff_hours" INTEGER NOT NULL DEFAULT 12,
    "auto_confirm_bookings" BOOLEAN NOT NULL DEFAULT true,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 0,
    "allow_any_employee" BOOLEAN NOT NULL DEFAULT true,
    "allow_guest_booking" BOOLEAN NOT NULL DEFAULT true,
    "require_phone" BOOLEAN NOT NULL DEFAULT true,
    "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify_admins_on_new_booking" BOOLEAN NOT NULL DEFAULT true,
    "notify_employee_on_new_booking" BOOLEAN NOT NULL DEFAULT true,
    "reminder_24h_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder_1h_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "salon_settings_pkey" PRIMARY KEY ("salon_id")
);

-- CreateTable
CREATE TABLE "salon_working_hours" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opens_at" TEXT NOT NULL,
    "closes_at" TEXT NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "salon_working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_closures" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salon_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salon_working_hours_salon_id_weekday_key" ON "salon_working_hours"("salon_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "salon_working_hours_salon_id_id_key" ON "salon_working_hours"("salon_id", "id");

-- CreateIndex
CREATE INDEX "salon_closures_salon_id_starts_on_idx" ON "salon_closures"("salon_id", "starts_on");

-- CreateIndex
CREATE UNIQUE INDEX "salon_closures_salon_id_id_key" ON "salon_closures"("salon_id", "id");

-- AddForeignKey
ALTER TABLE "salon_settings" ADD CONSTRAINT "salon_settings_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_working_hours" ADD CONSTRAINT "salon_working_hours_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_closures" ADD CONSTRAINT "salon_closures_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_closures" ADD CONSTRAINT "salon_closures_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

