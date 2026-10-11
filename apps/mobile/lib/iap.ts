import { Platform } from "react-native";
import type { MobileAuth } from "@linkwarden/types/global";
import type { Product, ProductSubscription, Purchase } from "expo-iap";

// Product ids as configured in App Store Connect / Play Console. The _IOS/_ANDROID
// variants override the shared value when the two stores use different ids. On
// Android this also works with a single subscription product that has monthly +
// yearly base plans (both env vars set to the same id) — the offer is picked by
// billing period.
export const MONTHLY_SKU =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_IAP_MONTHLY_SKU_IOS || "cloud_monthly",
    android: process.env.EXPO_PUBLIC_IAP_MONTHLY_SKU_ANDROID || "monthly",
  }) ?? "monthly";
export const YEARLY_SKU =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_IAP_YEARLY_SKU_IOS || "cloud_yearly",
    android: process.env.EXPO_PUBLIC_IAP_YEARLY_SKU_ANDROID || "yearly",
  }) ?? "yearly";

export const SUBSCRIPTION_SKUS = [...new Set([MONTHLY_SKU, YEARLY_SKU])];

export type PlanPeriod = "monthly" | "yearly";

export type PlanOption = {
  sku: string;
  offerToken?: string; // Android base-plan/offer to purchase
  displayPrice: string;
  priceAmount: number | null;
  currency: string | null;
  freeTrialPeriod: string | null; // e.g. "7 days"
};

const PERIOD_UNITS: Record<string, string> = {
  D: "day",
  W: "week",
  M: "month",
  Y: "year",
};

const pluralize = (value: number, unit: string) =>
  `${value} ${value === 1 ? unit : `${unit}s`}`;

// "P1W" × cycles → "1 week", "P3D" → "3 days"
const formatIsoPeriod = (isoPeriod: string, cycles = 1) => {
  const match = /^P(\d+)([DWMY])$/.exec(isoPeriod);
  if (!match) return null;

  const value = Number(match[1]) * Math.max(1, cycles);
  return pluralize(value, PERIOD_UNITS[match[2]]);
};

export const formatPrice = (amount: number, currency: string | null) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)}${currency ? ` ${currency}` : ""}`;
  }
};

const getIosPlan = (product: ProductSubscription): PlanOption => {
  const ios = product as Extract<ProductSubscription, { platform: "ios" }>;

  const hasFreeTrial =
    ios.introductoryPricePaymentModeIOS === "free-trial" &&
    ios.introductoryPriceNumberOfPeriodsIOS &&
    ios.introductoryPriceSubscriptionPeriodIOS &&
    ios.introductoryPriceSubscriptionPeriodIOS !== "empty";

  return {
    sku: product.id,
    displayPrice: product.displayPrice,
    priceAmount: product.price ?? null,
    currency: product.currency ?? null,
    freeTrialPeriod: hasFreeTrial
      ? pluralize(
          Number(ios.introductoryPriceNumberOfPeriodsIOS),
          ios.introductoryPriceSubscriptionPeriodIOS as string
        )
      : null,
  };
};

const getAndroidPlan = (
  product: ProductSubscription,
  period: PlanPeriod
): PlanOption | null => {
  const android = product as Extract<
    ProductSubscription,
    { platform: "android" }
  >;
  const expectedPeriod = period === "monthly" ? "P1M" : "P1Y";

  // The recurring price is the offer's last pricing phase; earlier phases are
  // trials/intro prices. Offers not matching the expected billing period belong
  // to another base plan of the same product.
  const candidates = (android.subscriptionOfferDetailsAndroid ?? [])
    .map((offer) => {
      const phases = offer.pricingPhases?.pricingPhaseList ?? [];
      const recurringPhase = phases[phases.length - 1];
      const trialPhase = phases.find(
        (phase) => phase.priceAmountMicros === "0"
      );

      return { offer, recurringPhase, trialPhase };
    })
    .filter(
      (candidate) => candidate.recurringPhase?.billingPeriod === expectedPeriod
    );

  if (!candidates.length) return null;

  // Prefer the offer that includes a free trial (mirrors the store's best offer)
  const best =
    candidates.find((candidate) => candidate.trialPhase) ?? candidates[0];

  const recurringPhase = best.recurringPhase!;

  return {
    sku: product.id,
    offerToken: best.offer.offerToken,
    displayPrice: recurringPhase.formattedPrice,
    priceAmount: Number(recurringPhase.priceAmountMicros) / 1_000_000,
    currency: recurringPhase.priceCurrencyCode ?? null,
    freeTrialPeriod: best.trialPhase
      ? formatIsoPeriod(
          best.trialPhase.billingPeriod,
          best.trialPhase.billingCycleCount
        )
      : null,
  };
};

// Normalizes the store products into the monthly/yearly options the UI renders
export const getPlanOption = (
  subscriptions: (Product | ProductSubscription)[],
  period: PlanPeriod
): PlanOption | null => {
  const sku = period === "monthly" ? MONTHLY_SKU : YEARLY_SKU;
  const product = subscriptions.find(
    (subscription): subscription is ProductSubscription =>
      subscription.id === sku && subscription.type === "subs"
  );

  if (!product) return null;

  return product.platform === "ios"
    ? getIosPlan(product)
    : getAndroidPlan(product, period);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type VerifyPurchaseResult = {
  active: boolean;
  // The store subscription is linked to a different Linkwarden account
  foreignAccount: boolean;
};

// Asks the server to validate the purchase with Apple/Google and activate the
// subscription. The identifiers are only lookup keys — the server re-fetches the
// authoritative state from the store, so retrying is always safe.
export const verifyPurchaseWithServer = async (
  auth: MobileAuth,
  purchase: Purchase,
  attempts = 5
): Promise<VerifyPurchaseResult> => {
  const body =
    Platform.OS === "ios"
      ? {
          platform: "ios",
          transactionId:
            (purchase as { transactionId?: string }).transactionId ??
            purchase.id,
        }
      : { platform: "android", purchaseToken: purchase.purchaseToken };

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(
        `${auth.instance}/api/v1/billing/verify-store-purchase`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.session}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        const data = await res.json().catch(() => null);
        return { active: Boolean(data?.active), foreignAccount: false };
      }

      // Client errors won't succeed on retry (bad token, foreign purchase, ...)
      if (res.status >= 400 && res.status < 500) {
        const data = await res.json().catch(() => null);
        return {
          active: false,
          foreignAccount: data?.code === "purchase_linked_to_another_account",
        };
      }
    } catch {}

    await wait(1500);
  }

  return { active: false, foreignAccount: false };
};
