/*
  Warnings:

  - The values [REVENUECAT] on the enum `SubscriptionProvider` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `revenueCatAppUserId` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `revenuecatMetadata` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `store` on the `Subscription` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionProvider_new" AS ENUM ('STRIPE', 'APPLE', 'GOOGLE');
ALTER TABLE "Subscription" ALTER COLUMN "provider" TYPE "SubscriptionProvider_new" USING ("provider"::text::"SubscriptionProvider_new");
ALTER TYPE "SubscriptionProvider" RENAME TO "SubscriptionProvider_old";
ALTER TYPE "SubscriptionProvider_new" RENAME TO "SubscriptionProvider";
DROP TYPE "SubscriptionProvider_old";
COMMIT;

-- DropIndex
DROP INDEX "Subscription_revenueCatAppUserId_key";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "revenueCatAppUserId",
DROP COLUMN "revenuecatMetadata",
DROP COLUMN "store",
ADD COLUMN     "storeMetadata" JSONB;

-- DropEnum
DROP TYPE "SubscriptionStore";
