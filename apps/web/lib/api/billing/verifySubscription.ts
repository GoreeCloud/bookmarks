import { prisma } from "@linkwarden/prisma";
import { Subscription, User } from "@linkwarden/prisma/client";
import checkStripeSubscriptionByEmail from "./checkStripeSubscriptionByEmail";
import syncStoreSubscription from "./syncStoreSubscription";
import { stripeStoreReset } from "./stripeStoreReset";

interface UserIncludingSubscription extends User {
  subscriptions: Subscription | null;
  parentSubscription: Subscription | null;
}

const TRIAL_PERIOD_DAYS = process.env.NEXT_PUBLIC_TRIAL_PERIOD_DAYS || 14;
const REQUIRE_CC = process.env.NEXT_PUBLIC_REQUIRE_CC === "true";
const STORE_SYNC_GRACE_PERIOD_MS = 3 * 86400000;

export default async function verifySubscription(
  user?: UserIncludingSubscription | null
) {
  if (!user) return null;

  const trialEndTime =
    new Date(user.createdAt).getTime() +
    (1 + Number(TRIAL_PERIOD_DAYS)) * 86400000; // Add 1 to account for the current day

  const daysLeft = Math.floor((trialEndTime - Date.now()) / 86400000);
  const subscriptionRequired = REQUIRE_CC || daysLeft <= 0;

  if (user.parentSubscription?.active || !subscriptionRequired) {
    return user;
  }

  if (
    !user.subscriptions?.active ||
    new Date() > user.subscriptions.currentPeriodEnd
  ) {
    if (user.subscriptions?.provider === "STRIPE") {
      const subscription = await checkStripeSubscriptionByEmail(
        user.email as string
      );

      if (
        !subscription ||
        !subscription.stripeSubscriptionId ||
        !subscription.currentPeriodEnd ||
        !subscription.currentPeriodStart ||
        !subscription.quantity
      ) {
        return null;
      }

      const {
        active,
        stripeSubscriptionId,
        currentPeriodStart,
        currentPeriodEnd,
        quantity,
      } = subscription;

      await prisma.subscription
        .upsert({
          where: {
            userId: user.id,
          },
          create: {
            active,
            provider: "STRIPE",
            ...stripeStoreReset,
            stripeSubscriptionId,
            currentPeriodStart: new Date(currentPeriodStart),
            currentPeriodEnd: new Date(currentPeriodEnd),
            quantity,
            userId: user.id,
          },
          update: {
            active,
            provider: "STRIPE",
            ...stripeStoreReset,
            stripeSubscriptionId,
            currentPeriodStart: new Date(currentPeriodStart),
            currentPeriodEnd: new Date(currentPeriodEnd),
            quantity,
          },
        })
        .catch((err) => console.log(err));
    } else {
      const subscription = await syncStoreSubscription(user).catch((err) => {
        console.log(err);
        return null;
      });

      if (!subscription?.active) {
        // A null result means the sync couldn't consult the store (missing store
        // credentials or identifiers) rather than an authoritative "expired".
        // Honor the row itself within a short grace window past its period end
        // instead of locking out a payer.
        const graceCutoff =
          user.subscriptions &&
          new Date(user.subscriptions.currentPeriodEnd).getTime() +
            STORE_SYNC_GRACE_PERIOD_MS;

        if (
          subscription === null &&
          user.subscriptions?.active &&
          graceCutoff &&
          Date.now() < graceCutoff
        ) {
          return user;
        }

        return null;
      }
    }
  }

  return user;
}
