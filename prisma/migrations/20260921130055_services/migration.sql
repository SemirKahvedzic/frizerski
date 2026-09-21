-- DropForeignKey
ALTER TABLE "blocked_times" DROP CONSTRAINT "blocked_times_salon_employee_fk";

-- DropForeignKey
ALTER TABLE "salon_memberships" DROP CONSTRAINT "salon_memberships_salon_employee_fk";

-- CreateTable
CREATE TABLE "service_categories" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0,
    "audience" "Audience" NOT NULL DEFAULT 'UNISEX',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_services" (
    "id" TEXT NOT NULL,
    "salon_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "price_override_cents" INTEGER,
    "duration_override_minutes" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_salon_id_id_key" ON "service_categories"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_salon_id_name_key" ON "service_categories"("salon_id", "name");

-- CreateIndex
CREATE INDEX "services_salon_id_category_id_sort_order_idx" ON "services"("salon_id", "category_id", "sort_order");

-- CreateIndex
CREATE INDEX "services_salon_id_is_active_idx" ON "services"("salon_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "services_salon_id_id_key" ON "services"("salon_id", "id");

-- CreateIndex
CREATE INDEX "employee_services_service_id_idx" ON "employee_services"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_services_employee_id_service_id_key" ON "employee_services"("employee_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_services_salon_id_id_key" ON "employee_services"("salon_id", "id");

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_salon_id_category_id_fkey" FOREIGN KEY ("salon_id", "category_id") REFERENCES "service_categories"("salon_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_services" ADD CONSTRAINT "employee_services_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_services" ADD CONSTRAINT "employee_services_salon_id_employee_id_fkey" FOREIGN KEY ("salon_id", "employee_id") REFERENCES "employees"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_services" ADD CONSTRAINT "employee_services_salon_id_service_id_fkey" FOREIGN KEY ("salon_id", "service_id") REFERENCES "services"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

