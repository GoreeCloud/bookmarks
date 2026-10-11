import { JWT } from "google-auth-library";
import readSecret from "../readSecret";

const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || "app.linkwarden";
const API_BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}`;

export const isGooglePlayConfigured = () =>
  Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);

let client: JWT | null = null;

const getClient = () => {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;

  if (!raw)
    throw new Error(
      "Missing GOOGLE_PLAY_SERVICE_ACCOUNT_JSON environment variable!"
    );

  if (!client) {
    const credentials = JSON.parse(readSecret(raw) as string) as {
      client_email: string;
      private_key: string;
    };

    client = new JWT({
      email: credentials.client_email,
      key: credentials.private_key.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
  }

  return client;
};

type SubscriptionPurchaseV2 = {
  kind?: string;
  startTime?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string;
    obfuscatedExternalProfileId?: string;
  };
  outOfAppPurchaseContext?: {
    expiredExternalAccountIdentifiers?: {
      obfuscatedExternalAccountId?: string;
    };
    expiredPurchaseToken?: string;
  };
  testPurchase?: object;
  lineItems?: {
    productId?: string;
    expiryTime?: string;
    offerDetails?: { basePlanId?: string; offerId?: string };
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }[];
};

// States that keep the entitlement: canceled stays entitled until expiryTime
const ENTITLED_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_CANCELED",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
]);

export type GoogleSubscriptionState = {
  active: boolean;
  sandbox: boolean;
  productId: string | null;
  obfuscatedExternalAccountId: string | null;
  expiredObfuscatedExternalAccountId: string | null;
  linkedPurchaseToken: string | null;
  expiredPurchaseToken: string | null;
  needsAcknowledgement: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  raw: SubscriptionPurchaseV2;
} | null;

export default async function getGoogleSubscriptionState(
  purchaseToken: string
): Promise<GoogleSubscriptionState> {
  let purchase: SubscriptionPurchaseV2;

  try {
    const response = await getClient().request<SubscriptionPurchaseV2>({
      url: `${API_BASE}/purchases/subscriptionsv2/tokens/${encodeURIComponent(
        purchaseToken
      )}`,
    });
    purchase = response.data;
  } catch (error: any) {
    const status = error?.response?.status;
    // Unknown, malformed, or purged (~60 days after expiry) tokens
    if (status === 400 || status === 404 || status === 410) return null;
    throw error;
  }

  const lineItems = purchase.lineItems ?? [];
  const latest = [...lineItems].sort(
    (a, b) =>
      new Date(b.expiryTime ?? 0).getTime() -
      new Date(a.expiryTime ?? 0).getTime()
  )[0];

  const expiryTime = latest?.expiryTime ? new Date(latest.expiryTime) : null;

  const active =
    ENTITLED_STATES.has(purchase.subscriptionState ?? "") &&
    (expiryTime?.getTime() ?? 0) > Date.now();

  return {
    active,
    sandbox: purchase.testPurchase !== undefined,
    productId: latest?.productId ?? null,
    obfuscatedExternalAccountId:
      purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    expiredObfuscatedExternalAccountId:
      purchase.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers
        ?.obfuscatedExternalAccountId ?? null,
    linkedPurchaseToken: purchase.linkedPurchaseToken ?? null,
    expiredPurchaseToken:
      purchase.outOfAppPurchaseContext?.expiredPurchaseToken ?? null,
    needsAcknowledgement:
      purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING",
    currentPeriodStart: purchase.startTime
      ? new Date(purchase.startTime)
      : null,
    currentPeriodEnd: expiryTime,
    raw: purchase,
  };
}

// Turns off auto-renew; the subscription stays paid-up until its period ends.
// Used when an account is deleted, since the user can no longer benefit from it.
// (App Store subscriptions have no equivalent — only the customer can cancel.)
export async function cancelGoogleSubscription(purchaseToken: string) {
  try {
    await getClient().request({
      url: `${API_BASE}/purchases/subscriptionsv2/tokens/${encodeURIComponent(
        purchaseToken
      )}:cancel`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  } catch (error: any) {
    const status = error?.response?.status;
    // Already cancelled/expired or purged token — nothing left to cancel
    if (status === 400 || status === 404 || status === 410) return;
    throw error;
  }
}

// Unacknowledged purchases are auto-refunded by Google after 3 days, so this must
// run server-side even though the app also finishes the transaction client-side.
export async function acknowledgeGoogleSubscription(
  purchaseToken: string,
  productId: string
) {
  try {
    await getClient().request({
      url: `${API_BASE}/purchases/subscriptions/${encodeURIComponent(
        productId
      )}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  } catch (error: any) {
    // 400 = already acknowledged (client finished the transaction first)
    if (error?.response?.status === 400) return;
    throw error;
  }
}
