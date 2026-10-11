import { prisma } from "@linkwarden/prisma";
import type { Prisma, Subscription, User } from "@linkwarden/prisma/client";
import getAppleSubscriptionState, {
  isAppStoreConfigured,
  type AppleSubscriptionState,
} from "./appStore";
import getGoogleSubscriptionState, {
  acknowledgeGoogleSubscription,
  isGooglePlayConfigured,
  type GoogleSubscriptionState,
} from "./googlePlay";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isStoreBillingConfigured = () =>
  isAppStoreConfigured() || isGooglePlayConfigured();

// Error code thrown (hint-driven syncs only) when the store purchase is stamped
// with a different Linkwarden account, so the API layer can surface a precise
// error to the app.
export const FOREIGN_PURCHASE = "FOREIGN_PURCHASE";

const foreignPurchaseError = () =>
  Object.assign(new Error("This purchase is linked to another account."), {
    code: FOREIGN_PURCHASE,
  });

// Sandbox/TestFlight and Play license-tester purchases only grant entitlements in
// production when explicitly allowed (e.g. during App Review).
const acceptsSandbox = () =>
  process.env.STORE_ACCEPT_SANDBOX === "true" ||
  process.env.NODE_ENV !== "production";

const shouldGrant = (state: { sandbox: boolean } | null) =>
  Boolean(state && (!state.sandbox || acceptsSandbox()));

export async function writeAppleSubscription(
  userId: number,
  state: NonNullable<AppleSubscriptionState>
): Promise<Subscription | null> {
  if (state.sandbox && !acceptsSandbox()) return null;
  if (!state.currentPeriodStart || !state.currentPeriodEnd) return null;
  if (!state.originalTransactionId) return null;

  // An inactive state may be stale (delayed/replayed notification) or refer to a
  // subscription the user replaced (e.g. they now pay via Stripe) — it may only
  // deactivate the row that actually tracks this exact store subscription, never
  // take over the user's row.
  if (!state.active) {
    await prisma.subscription.updateMany({
      where: {
        userId,
        provider: "APPLE",
        storeOriginalTransactionId: state.originalTransactionId,
      },
      data: {
        active: false,
        storeMetadata: state.raw as unknown as Prisma.InputJsonValue,
        currentPeriodStart: state.currentPeriodStart,
        currentPeriodEnd: state.currentPeriodEnd,
      },
    });
    return null;
  }

  // The same App Store subscription can only back one account at a time; release
  // it from any other account (e.g. re-restored after switching Linkwarden accounts).
  await prisma.subscription.updateMany({
    where: {
      storeOriginalTransactionId: state.originalTransactionId,
      NOT: { userId },
    },
    data: { active: false, storeOriginalTransactionId: null },
  });

  const data = {
    active: true,
    provider: "APPLE" as const,
    stripeSubscriptionId: null,
    storeOriginalTransactionId: state.originalTransactionId,
    storeProductId: state.productId,
    googlePurchaseToken: null,
    storeMetadata: state.raw as unknown as Prisma.InputJsonValue,
    currentPeriodStart: state.currentPeriodStart,
    currentPeriodEnd: state.currentPeriodEnd,
    quantity: 1,
  };

  return prisma.subscription.upsert({
    where: { userId },
    create: { ...data, userId },
    update: data,
  });
}

export async function writeGoogleSubscription(
  userId: number,
  state: NonNullable<GoogleSubscriptionState>,
  purchaseToken: string
): Promise<Subscription | null> {
  if (state.sandbox && !acceptsSandbox()) return null;
  if (!state.currentPeriodStart || !state.currentPeriodEnd) return null;

  // Same rule as Apple: an inactive state (expired, or a superseded token whose
  // replacement the row already tracks) may only touch the row holding this token.
  if (!state.active) {
    await prisma.subscription.updateMany({
      where: {
        userId,
        provider: "GOOGLE",
        googlePurchaseToken: purchaseToken,
      },
      data: {
        active: false,
        storeMetadata: state.raw as unknown as Prisma.InputJsonValue,
        currentPeriodStart: state.currentPeriodStart,
        currentPeriodEnd: state.currentPeriodEnd,
      },
    });
    return null;
  }

  await prisma.subscription.updateMany({
    where: { googlePurchaseToken: purchaseToken, NOT: { userId } },
    data: { active: false, googlePurchaseToken: null },
  });

  const data = {
    active: true,
    provider: "GOOGLE" as const,
    stripeSubscriptionId: null,
    storeOriginalTransactionId: null,
    storeProductId: state.productId,
    googlePurchaseToken: purchaseToken,
    storeMetadata: state.raw as unknown as Prisma.InputJsonValue,
    currentPeriodStart: state.currentPeriodStart,
    currentPeriodEnd: state.currentPeriodEnd,
    quantity: 1,
  };

  const subscription = await prisma.subscription.upsert({
    where: { userId },
    create: { ...data, userId },
    update: data,
  });

  // Google auto-refunds unacknowledged purchases after 3 days, so acknowledge as
  // soon as the entitlement is granted (renewals never need acknowledgement).
  if (state.needsAcknowledgement && state.productId) {
    await acknowledgeGoogleSubscription(purchaseToken, state.productId).catch(
      (error) => console.error("Error acknowledging Google purchase:", error)
    );
  }

  return subscription;
}

// Ownership of a client-reported Apple transaction. The appAccountToken is stamped
// with the buyer's user.uuid at purchase time; out-of-app purchases (e.g. offer-code
// redemptions in the App Store) have none.
const ownsAppleTransaction = async (
  user: Pick<User, "id" | "uuid">,
  state: NonNullable<AppleSubscriptionState>
) => {
  if (state.appAccountToken) {
    if (state.appAccountToken === user.uuid) return true;

    if (UUID_REGEX.test(state.appAccountToken)) {
      const stampedUser = await prisma.user.findUnique({
        where: { uuid: state.appAccountToken },
        select: { id: true },
      });
      // Stamped for a live account that isn't the caller — refuse. If the stamped
      // account was deleted (user deleted and recreated their Linkwarden account),
      // the store subscription can't be re-stamped, so fall through to the
      // claimed-row check below.
      if (stampedUser) return false;
    } else {
      return false;
    }
  }

  // No usable token (out-of-app purchase, or deleted stamped account): allow
  // unless the transaction is already bound to another account's row.
  if (!state.originalTransactionId) return false;

  const claimedBy = await prisma.subscription.findUnique({
    where: { storeOriginalTransactionId: state.originalTransactionId },
    select: { userId: true },
  });

  return !claimedBy || claimedBy.userId === user.id;
};

// Ownership of a client-reported Play purchase. The buyer's user.uuid is stamped
// as obfuscatedAccountId at purchase time.
const ownsGooglePurchase = async (
  user: Pick<User, "id" | "uuid">,
  state: NonNullable<GoogleSubscriptionState>,
  purchaseToken: string
) => {
  const accountId =
    state.obfuscatedExternalAccountId ??
    state.expiredObfuscatedExternalAccountId;

  if (accountId === user.uuid) return true;

  if (accountId && UUID_REGEX.test(accountId)) {
    const stampedUser = await prisma.user.findUnique({
      where: { uuid: accountId },
      select: { id: true },
    });
    // Deleted-and-recreated account — possession of the token decides
    if (stampedUser) return false;
  }

  // Unrecognized/absent id: allow unless another account already holds the token
  const claimedBy = await prisma.subscription.findFirst({
    where: {
      googlePurchaseToken: {
        in: [purchaseToken, state.linkedPurchaseToken ?? purchaseToken],
      },
    },
    select: { userId: true },
  });

  return !claimedBy || claimedBy.userId === user.id;
};

export type StorePurchaseHint =
  | { provider: "APPLE"; transactionId: string }
  | { provider: "GOOGLE"; purchaseToken: string };

// Re-syncs a user's App Store/Play Store subscription straight from Apple/Google.
// `hint` carries a client-reported purchase (purchase/restore flows) and is subject
// to ownership checks; without it the identifiers already stored on the user's own
// subscription row are used (ownership was established when they were stored).
// Returns null when there was nothing to sync from; returns the (possibly
// deactivated) row when the store answered authoritatively.
export default async function syncStoreSubscription(
  user: Pick<User, "id" | "uuid">,
  hint?: StorePurchaseHint
): Promise<Subscription | null> {
  const existing = hint
    ? null
    : await prisma.subscription.findUnique({ where: { userId: user.id } });

  const deactivate = async () => {
    await prisma.subscription.updateMany({
      where: { userId: user.id, provider: { in: ["APPLE", "GOOGLE"] } },
      data: { active: false },
    });
    return prisma.subscription.findUnique({ where: { userId: user.id } });
  };

  if (
    (hint?.provider === "APPLE" ||
      (!hint && existing?.provider === "APPLE" &&
        existing.storeOriginalTransactionId)) &&
    isAppStoreConfigured()
  ) {
    const transactionId =
      hint?.provider === "APPLE"
        ? hint.transactionId
        : (existing?.storeOriginalTransactionId as string);

    const state = await getAppleSubscriptionState(transactionId);

    if (!state) return hint ? null : deactivate();

    if (hint && !(await ownsAppleTransaction(user, state))) {
      console.warn(
        `App Store transaction ${state.originalTransactionId} belongs to another account.`
      );
      throw foreignPurchaseError();
    }

    if (!shouldGrant(state) || !state.active)
      return hint ? null : deactivate();

    return writeAppleSubscription(user.id, state);
  }

  if (
    (hint?.provider === "GOOGLE" ||
      (!hint && existing?.provider === "GOOGLE" &&
        existing.googlePurchaseToken)) &&
    isGooglePlayConfigured()
  ) {
    const purchaseToken =
      hint?.provider === "GOOGLE"
        ? hint.purchaseToken
        : (existing?.googlePurchaseToken as string);

    const state = await getGoogleSubscriptionState(purchaseToken);

    if (!state) return hint ? null : deactivate();

    if (hint && !(await ownsGooglePurchase(user, state, purchaseToken))) {
      console.warn(
        "Play Store purchase token belongs to another account (obfuscated id mismatch)."
      );
      throw foreignPurchaseError();
    }

    if (!shouldGrant(state) || !state.active)
      return hint ? null : deactivate();

    return writeGoogleSubscription(user.id, state, purchaseToken);
  }

  // Nothing to sync from: no store identifiers on file, or the store isn't
  // configured.
  return null;
}
