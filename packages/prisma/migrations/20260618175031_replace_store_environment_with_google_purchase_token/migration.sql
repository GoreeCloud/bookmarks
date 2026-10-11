/*
  Warnings:

  - You are about to drop the column `storeEnvironment` on the `Subscription` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[googlePurchaseToken]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "storeEnvironment",
ADD COLUMN     "googlePurchaseToken" TEXT;

-- DropEnum
DROP TYPE "SubscriptionEnvironment";

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_googlePurchaseToken_key" ON "Subscription"("googlePurchaseToken");
