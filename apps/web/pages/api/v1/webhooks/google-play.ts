import type { NextApiRequest, NextApiResponse } from "next";
import { timingSafeEqual } from "crypto";
import { prisma } from "@linkwarden/prisma";
import getGoogleSubscriptionState, {
  isGooglePlayConfigured,
} from "@/lib/api/billing/googlePlay";
import { writeGoogleSubscription } from "@/lib/api/billing/syncStoreSubscription";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || "app.linkwarden";

const isAuthorized = (req: NextApiRequest) => {
  const secret = process.env.GOOGLE_PLAY_PUBSUB_TOKEN;
  const token = req.query.token;

  if (!secret || typeof token !== "string") return false;

  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

type DeveloperNotification = {
  version?: string;
  packageName?: string;
  subscriptionNotification?: {
    notificationType?: number;
    purchaseToken?: string;
  };
  testNotification?: { version?: string };
};

// Google Play Real-Time Developer Notifications, delivered as a Cloud Pub/Sub
// push subscription. The notification only signals that something changed — the
// authoritative state always comes from purchases.subscriptionsv2.get.
export default async function googlePlayWebhook(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ response: "Method not allowed." });
  }

  if (process.env.NEXT_PUBLIC_DEMO === "true")
    return res.status(400).json({
      response:
        "This action is disabled because this is a read-only demo of Linkwarden.",
    });

  if (!isGooglePlayConfigured() || !process.env.GOOGLE_PLAY_PUBSUB_TOKEN) {
    return res.status(400).json({
      response:
        "This action is disabled because Play Store billing is not configured.",
    });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ response: "Invalid token." });
  }

  let notification: DeveloperNotification | null = null;

  try {
    notification = JSON.parse(
      Buffer.from(req.body?.message?.data ?? "", "base64").toString("utf8")
    );
  } catch {
    // Malformed payloads are acknowledged so Pub/Sub doesn't redeliver them
  }

  const purchaseToken = notification?.subscriptionNotification?.purchaseToken;

  if (
    !notification ||
    notification.testNotification ||
    notification.packageName !== PACKAGE_NAME ||
    !purchaseToken
  ) {
    return res.status(200).json({ response: "Event ignored." });
  }

  try {
    const state = await getGoogleSubscriptionState(purchaseToken);

    if (!state) {
      return res.status(200).json({ response: "Purchase not found." });
    }

    // Map the token to a user: the row that holds it, the row holding the token it
    // replaced (upgrades/resubscribes issue a new token with linkedPurchaseToken),
    // the obfuscated account id set at purchase time, or — for out-of-app
    // resubscriptions — the identifiers of the expired subscription it follows.
    const knownTokens = [
      purchaseToken,
      state.linkedPurchaseToken,
      state.expiredPurchaseToken,
    ].filter((token): token is string => Boolean(token));

    let userId: number | null = null;

    const subscription = await prisma.subscription.findFirst({
      where: { googlePurchaseToken: { in: knownTokens } },
      select: { userId: true },
    });
    if (subscription) userId = subscription.userId;

    if (!userId) {
      const accountId =
        state.obfuscatedExternalAccountId ??
        state.expiredObfuscatedExternalAccountId;

      if (accountId && UUID_REGEX.test(accountId)) {
        const user = await prisma.user.findUnique({
          where: { uuid: accountId },
          select: { id: true },
        });
        if (user) userId = user.id;
      }
    }

    if (!userId) {
      console.warn("Play Store notification for unmapped purchase token.");
      return res.status(200).json({ response: "User not found." });
    }

    await writeGoogleSubscription(userId, state, purchaseToken);
  } catch (error) {
    console.error("Error handling Play Store notification:", error);
    // Non-2xx makes Pub/Sub redeliver with backoff — desired for transient failures
    return res.status(500).send("Server Error");
  }

  return res.status(200).json({ response: "Done!" });
}
