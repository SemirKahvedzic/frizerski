-- CreateEnum
CREATE TYPE "TimeOffType" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BlockedTimeSource" AS ENUM ('MANUAL', 'EXTERNAL');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "user_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "position" TEXT,
    "bio" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "audience" "Audience" NOT NULL DEFAULT 'UNISEX',
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_bookable_online" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedules" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "valid_from" DATE,
    "valid_until" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_breaks" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "employee_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_time_off" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type" "TimeOffType" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_times" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "source" "BlockedTimeSource" NOT NULL DEFAULT 'MANUAL',
    "external_ref" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_times_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_salon_id_is_active_sort_order_idx" ON "employees"("salon_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "employees_salon_id_id_key" ON "employees"("salon_id", "id");

-- CreateIndex
CREATE INDEX "employee_schedules_employee_id_weekday_idx" ON "employee_schedules"("employee_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "employee_schedules_salon_id_id_key" ON "employee_schedules"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_breaks_salon_id_id_key" ON "employee_breaks"("salon_id", "id");

-- CreateIndex
CREATE INDEX "employee_time_off_employee_id_starts_at_ends_at_idx" ON "employee_time_off"("employee_id", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "employee_time_off_salon_id_id_key" ON "employee_time_off"("salon_id", "id");

-- CreateIndex
CREATE INDEX "blocked_times_salon_id_employee_id_starts_at_idx" ON "blocked_times"("salon_id", "employee_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_times_salon_id_id_key" ON "blocked_times"("salon_id", "id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_salon_id_employee_id_fkey" FOREIGN KEY ("salon_id", "employee_id") REFERENCES "employees"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_breaks" ADD CONSTRAINT "employee_breaks_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_breaks" ADD CONSTRAINT "employee_breaks_salon_id_schedule_id_fkey" FOREIGN KEY ("salon_id", "schedule_id") REFERENCES "employee_schedules"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_time_off" ADD CONSTRAINT "employee_time_off_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_time_off" ADD CONSTRAINT "employee_time_off_salon_id_employee_id_fkey" FOREIGN KEY ("salon_id", "employee_id") REFERENCES "employees"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_times" ADD CONSTRAINT "blocked_times_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Composite tenant-integrity FKs on nullable employee references (Prisma cannot
-- express a relation mixing required and optional fields). MATCH SIMPLE skips
-- rows where employee_id IS NULL.
ALTER TABLE "salon_memberships"
  ADD CONSTRAINT "salon_memberships_salon_employee_fk"
  FOREIGN KEY ("salon_id", "employee_id") REFERENCES "employees"("salon_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "blocked_times"
  ADD CONSTRAINT "blocked_times_salon_employee_fk"
  FOREIGN KEY ("salon_id", "employee_id") REFERENCES "employees"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
