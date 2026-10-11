/*
  Warnings:

  - A unique constraint covering the columns `[storeOriginalTransactionId]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStore" AS ENUM ('APP_STORE', 'PLAY_STORE');

-- CreateEnum
CREATE TYPE "SubscriptionEnvironment" AS ENUM ('PRODUCTION', 'SANDBOX');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "revenuecatMetadata" JSONB,
ADD COLUMN     "store" "SubscriptionStore",
ADD COLUMN     "storeEnvironment" "SubscriptionEnvironment",
ADD COLUMN     "storeOriginalTransactionId" TEXT,
ADD COLUMN     "storeProductId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_storeOriginalTransactionId_key" ON "Subscription"("storeOriginalTransactionId");
