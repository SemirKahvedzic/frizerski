-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'ADMIN', 'WALK_IN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NONE', 'PENDING', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('H24', 'H1');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "user_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "first_booking_at" TIMESTAMPTZ(3),
    "last_booking_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 0,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "source" "BookingSource" NOT NULL DEFAULT 'ONLINE',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NONE',
    "client_notes" TEXT,
    "internal_notes" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" TEXT,
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "action" TEXT NOT NULL,
    "previous_starts_at" TIMESTAMPTZ(3),
    "new_starts_at" TIMESTAMPTZ(3),
    "changed_by_id" TEXT,
    "changed_by" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_reminders" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "job_id" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_access_tokens" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT,
    "type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "last_error" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_salon_id_last_name_first_name_idx" ON "customers"("salon_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "customers_salon_id_phone_idx" ON "customers"("salon_id", "phone");

-- CreateIndex
CREATE INDEX "customers_user_id_idx" ON "customers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_salon_id_id_key" ON "customers"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_salon_id_email_key" ON "customers"("salon_id", "email");

-- CreateIndex
CREATE INDEX "bookings_salon_id_starts_at_idx" ON "bookings"("salon_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_employee_id_starts_at_idx" ON "bookings"("employee_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_customer_id_starts_at_idx" ON "bookings"("customer_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_salon_id_status_starts_at_idx" ON "bookings"("salon_id", "status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_salon_id_id_key" ON "bookings"("salon_id", "id");

-- CreateIndex
CREATE INDEX "booking_status_history_booking_id_created_at_idx" ON "booking_status_history"("booking_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_status_history_salon_id_id_key" ON "booking_status_history"("salon_id", "id");

-- CreateIndex
CREATE INDEX "booking_reminders_status_scheduled_for_idx" ON "booking_reminders"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "booking_reminders_booking_id_kind_scheduled_for_key" ON "booking_reminders"("booking_id", "kind", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "booking_reminders_salon_id_id_key" ON "booking_reminders"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_access_tokens_token_hash_key" ON "booking_access_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "booking_access_tokens_salon_id_id_key" ON "booking_access_tokens"("salon_id", "id");

-- CreateIndex
CREATE INDEX "outbox_events_status_occurred_at_idx" ON "outbox_events"("status", "occurred_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_salon_id_customer_id_fkey" FOREIGN KEY ("salon_id", "customer_id") REFERENCES "customers"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_salon_id_employee_id_fkey" FOREIGN KEY ("salon_id", "employee_id") REFERENCES "employees"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_salon_id_service_id_fkey" FOREIGN KEY ("salon_id", "service_id") REFERENCES "services"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_salon_id_booking_id_fkey" FOREIGN KEY ("salon_id", "booking_id") REFERENCES "bookings"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_reminders" ADD CONSTRAINT "booking_reminders_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_reminders" ADD CONSTRAINT "booking_reminders_salon_id_booking_id_fkey" FOREIGN KEY ("salon_id", "booking_id") REFERENCES "bookings"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_access_tokens" ADD CONSTRAINT "booking_access_tokens_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_access_tokens" ADD CONSTRAINT "booking_access_tokens_salon_id_booking_id_fkey" FOREIGN KEY ("salon_id", "booking_id") REFERENCES "bookings"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- No overlapping active bookings per employee (docs/database.md §5). This is
-- the last line of defence behind the advisory lock in the booking service.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE (status IN ('PENDING', 'CONFIRMED'));

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_check" CHECK ("ends_at" > "starts_at");

-- One customer record per user per salon (guests have user_id NULL).
CREATE UNIQUE INDEX "customers_salon_user_key" ON "customers" ("salon_id", "user_id") WHERE "user_id" IS NOT NULL;
