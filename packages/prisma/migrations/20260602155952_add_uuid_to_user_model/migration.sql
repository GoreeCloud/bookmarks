/*
  Warnings:

  - A unique constraint covering the columns `[uuid]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - The required column `uuid` was added to the `User` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable

ALTER TABLE "User" ADD COLUMN "uuid" UUID;

-- Backfill existing users

UPDATE "User" SET "uuid" = gen_random_uuid() WHERE "uuid" IS NULL;

-- Make it required after backfill

ALTER TABLE "User" ALTER COLUMN "uuid" SET NOT NULL;

-- CreateIndex

CREATE UNIQUE INDEX "User_uuid_key" ON "User"("uuid");