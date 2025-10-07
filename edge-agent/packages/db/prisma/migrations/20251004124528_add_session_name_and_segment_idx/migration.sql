/*
  Warnings:

  - Added the required column `name` to the `sessions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `segment_idx` to the `sessions` table without a default value. This is not possible if the table is not empty.

*/

-- Step 1: Add columns as nullable first
ALTER TABLE "sessions" ADD COLUMN "name" TEXT;
ALTER TABLE "sessions" ADD COLUMN "segment_idx" INTEGER;

-- Step 2: Populate existing rows with default values
-- Generate name from session_id for existing sessions (fallback)
UPDATE "sessions" 
SET "name" = 'sesion_' || to_char(to_timestamp("edge_start_ts" / 1000), 'YYYYMMDD-HH24MISS'),
    "segment_idx" = 1
WHERE "name" IS NULL;

-- Step 3: Make columns NOT NULL
ALTER TABLE "sessions" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "segment_idx" SET NOT NULL;

-- CreateIndex
CREATE INDEX "idx_sessions_dev_name" ON "sessions"("dev_id", "name");
