-- Extensions required by the booking engine (docs/database.md §5).
-- btree_gist: range exclusion constraint on bookings (no overlapping appointments per employee).
-- pgcrypto: gen_random_bytes for tokens generated in SQL.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
