/*
  Warnings:

  - A unique constraint covering the columns `[revenueCatAppUserId]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `provider` to the `Subscription` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SubscriptionProvider" AS ENUM ('STRIPE', 'REVENUECAT');

-- AlterTable: add provider as NULLABLE first so existing rows aren't rejected
ALTER TABLE "Subscription" ADD COLUMN     "provider" "SubscriptionProvider",
ADD COLUMN     "revenueCatAppUserId" UUID,
ALTER COLUMN "stripeSubscriptionId" DROP NOT NULL;

-- Backfill: every existing row with a Stripe subscription ID is a Stripe subscription
UPDATE "Subscription" SET "provider" = 'STRIPE' WHERE "stripeSubscriptionId" IS NOT NULL;

-- Now enforce NOT NULL to match the schema
ALTER TABLE "Subscription" ALTER COLUMN "provider" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_revenueCatAppUserId_key" ON "Subscription"("revenueCatAppUserId");