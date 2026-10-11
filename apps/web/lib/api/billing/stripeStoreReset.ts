import { Prisma } from "@linkwarden/prisma/client";

// A Stripe subscription is web-only, so every write that sets `provider: "STRIPE"`
// clears the IAP-store fields. This keeps a row that switched over from the App
// Store/Play Store from carrying stale store identifiers, and is shared across every
// Stripe write path so they can't drift apart.
export const stripeStoreReset = {
  storeOriginalTransactionId: null,
  storeProductId: null,
  googlePurchaseToken: null,
  storeMetadata: Prisma.DbNull,
};
