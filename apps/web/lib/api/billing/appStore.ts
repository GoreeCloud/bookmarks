import {
  AppStoreServerAPIClient,
  APIError,
  APIException,
  Environment,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type LastTransactionsItem,
  type StatusResponse,
} from "@apple/app-store-server-library";
import readSecret from "../readSecret";

const BUNDLE_ID = process.env.APP_STORE_BUNDLE_ID || "app.linkwarden";

export const isAppStoreConfigured = () =>
  Boolean(
    process.env.APP_STORE_ISSUER_ID &&
      process.env.APP_STORE_KEY_ID &&
      process.env.APP_STORE_PRIVATE_KEY
  );

const clients: Partial<Record<Environment, AppStoreServerAPIClient>> = {};

const getClient = (environment: Environment) => {
  if (!isAppStoreConfigured())
    throw new Error(
      "Missing APP_STORE_ISSUER_ID/APP_STORE_KEY_ID/APP_STORE_PRIVATE_KEY environment variables!"
    );

  if (!clients[environment]) {
    clients[environment] = new AppStoreServerAPIClient(
      readSecret(process.env.APP_STORE_PRIVATE_KEY) as string,
      process.env.APP_STORE_KEY_ID as string,
      process.env.APP_STORE_ISSUER_ID as string,
      BUNDLE_ID,
      environment
    );
  }

  return clients[environment] as AppStoreServerAPIClient;
};

// The JWS payloads we consume are either fetched from Apple's API over TLS or
// re-validated against it, so decoding without cert-chain verification is safe here.
export const decodeJws = <T>(jws?: string | null): T | null => {
  try {
    if (!jws) return null;
    return JSON.parse(
      Buffer.from(jws.split(".")[1], "base64url").toString("utf8")
    ) as T;
  } catch {
    return null;
  }
};

const NOT_FOUND_ERRORS = new Set<number>([
  APIError.TRANSACTION_ID_NOT_FOUND,
  APIError.ORIGINAL_TRANSACTION_ID_NOT_FOUND,
]);

const getStatuses = async (transactionId: string) => {
  try {
    const response = await getClient(
      Environment.PRODUCTION
    ).getAllSubscriptionStatuses(transactionId);
    return { response, environment: Environment.PRODUCTION };
  } catch (error) {
    // Sandbox/TestFlight transactions 404 on the production host; retry against sandbox
    if (
      error instanceof APIException &&
      error.apiError !== null &&
      NOT_FOUND_ERRORS.has(error.apiError)
    ) {
      const response = await getClient(
        Environment.SANDBOX
      ).getAllSubscriptionStatuses(transactionId);
      return { response, environment: Environment.SANDBOX };
    }

    throw error;
  }
};

// Statuses that keep the entitlement: 1 = active, 4 = billing grace period
const ENTITLED_STATUSES = new Set<number>([1, 4]);

export type AppleSubscriptionState = {
  active: boolean;
  sandbox: boolean;
  originalTransactionId: string | null;
  productId: string | null;
  appAccountToken: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  raw: {
    transaction: JWSTransactionDecodedPayload;
    renewalInfo: JWSRenewalInfoDecodedPayload | null;
    status: number | undefined;
  };
} | null;

// Resolves the authoritative subscription state for any transaction id
// (transactionId or originalTransactionId) belonging to the customer.
export default async function getAppleSubscriptionState(
  transactionId: string
): Promise<AppleSubscriptionState> {
  let statuses: { response: StatusResponse; environment: Environment };

  try {
    statuses = await getStatuses(transactionId);
  } catch (error) {
    if (
      error instanceof APIException &&
      error.apiError !== null &&
      NOT_FOUND_ERRORS.has(error.apiError)
    ) {
      return null;
    }
    throw error;
  }

  const lastTransactions = (statuses.response.data ?? []).flatMap(
    (group) => group.lastTransactions ?? []
  );

  if (!lastTransactions.length) return null;

  const decorated = lastTransactions
    .map((item: LastTransactionsItem) => {
      const transaction = decodeJws<JWSTransactionDecodedPayload>(
        item.signedTransactionInfo
      );
      const renewalInfo = decodeJws<JWSRenewalInfoDecodedPayload>(
        item.signedRenewalInfo
      );
      return { item, transaction, renewalInfo };
    })
    .filter(
      (
        entry
      ): entry is typeof entry & {
        transaction: JWSTransactionDecodedPayload;
      } => Boolean(entry.transaction)
    );

  if (!decorated.length) return null;

  // A customer that switched plans within the group has one entry per product;
  // prefer the entitled one, otherwise the one that expires last.
  const best =
    decorated.find(
      (entry) =>
        ENTITLED_STATUSES.has(Number(entry.item.status)) &&
        !entry.transaction.revocationDate
    ) ??
    decorated.sort(
      (a, b) =>
        (b.transaction.expiresDate ?? 0) - (a.transaction.expiresDate ?? 0)
    )[0];

  const { item, transaction, renewalInfo } = best;

  const expiresDate = transaction.expiresDate ?? null;
  const gracePeriodExpiresDate = renewalInfo?.gracePeriodExpiresDate ?? null;
  const currentPeriodEndMs =
    gracePeriodExpiresDate && gracePeriodExpiresDate > (expiresDate ?? 0)
      ? gracePeriodExpiresDate
      : expiresDate;

  const active =
    ENTITLED_STATUSES.has(Number(item.status)) &&
    !transaction.revocationDate &&
    (currentPeriodEndMs ?? 0) > Date.now();

  return {
    active,
    sandbox: statuses.environment === Environment.SANDBOX,
    originalTransactionId:
      transaction.originalTransactionId ?? item.originalTransactionId ?? null,
    productId: transaction.productId ?? null,
    // Apple lowercases the UUID in JWS payloads; user.uuid is stored lowercase too
    appAccountToken: transaction.appAccountToken?.toLowerCase() ?? null,
    currentPeriodStart: transaction.purchaseDate
      ? new Date(transaction.purchaseDate)
      : null,
    currentPeriodEnd: currentPeriodEndMs ? new Date(currentPeriodEndMs) : null,
    raw: { transaction, renewalInfo, status: item.status },
  };
}
