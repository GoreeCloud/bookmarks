import type { NextApiRequest, NextApiResponse } from "next";
import verifyToken from "@/lib/api/verifyToken";
import { prisma } from "@linkwarden/prisma";
import syncStoreSubscription, {
  FOREIGN_PURCHASE,
  type StorePurchaseHint,
} from "@/lib/api/billing/syncStoreSubscription";
import { isAppStoreConfigured } from "@/lib/api/billing/appStore";
import { isGooglePlayConfigured } from "@/lib/api/billing/googlePlay";

// Called by the mobile app right after a purchase or restore. The reported
// identifiers are only used as lookup keys — the subscription state itself is
// fetched from Apple/Google, so a forged request can't grant an entitlement.
export default async function verifyStorePurchase(
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

  const token = await verifyToken({ req });

  if (typeof token === "string") {
    return res.status(401).json({ response: token });
  }

  const platform = req.body?.platform;
  const transactionId = req.body?.transactionId;
  const purchaseToken = req.body?.purchaseToken;

  let hint: StorePurchaseHint;

  if (platform === "ios" && typeof transactionId === "string" && transactionId) {
    if (!isAppStoreConfigured())
      return res
        .status(400)
        .json({ response: "App Store billing is not configured." });

    hint = { provider: "APPLE", transactionId };
  } else if (
    platform === "android" &&
    typeof purchaseToken === "string" &&
    purchaseToken
  ) {
    if (!isGooglePlayConfigured())
      return res
        .status(400)
        .json({ response: "Play Store billing is not configured." });

    hint = { provider: "GOOGLE", purchaseToken };
  } else {
    return res.status(400).json({ response: "Invalid request." });
  }

  const user = await prisma.user.findUnique({
    where: { id: token.id },
    select: { id: true, uuid: true },
  });

  if (!user) return res.status(404).json({ response: "User not found." });

  try {
    const subscription = await syncStoreSubscription(user, hint);

    return res.status(200).json({
      response: subscription?.active
        ? "Done!"
        : "No active subscription found for this purchase.",
      active: Boolean(subscription?.active),
    });
  } catch (error: any) {
    if (error?.code === FOREIGN_PURCHASE) {
      return res.status(409).json({
        response: "This purchase is linked to another Linkwarden account.",
        code: "purchase_linked_to_another_account",
        active: false,
      });
    }

    console.error("Error verifying store purchase:", error);
    return res.status(500).json({ response: "Server Error" });
  }
}
