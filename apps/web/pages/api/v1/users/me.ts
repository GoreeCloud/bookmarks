import type { NextApiRequest, NextApiResponse } from "next";
import getUserById from "@/lib/api/controllers/users/userId/getUserById";
import syncStoreSubscription from "@/lib/api/billing/syncStoreSubscription";
import verifyToken from "@/lib/api/verifyToken";
import { prisma } from "@linkwarden/prisma";

const syncStoreSubscriptionIfNeeded = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      uuid: true,
      subscriptions: {
        select: {
          active: true,
          provider: true,
          currentPeriodEnd: true,
        },
      },
      parentSubscription: {
        select: {
          active: true,
        },
      },
    },
  });

  if (!user || user.parentSubscription?.active) return;

  const shouldSyncStoreSubscription =
    !user.subscriptions ||
    !user.subscriptions.active ||
    (user.subscriptions.provider !== "STRIPE" &&
      new Date() > user.subscriptions.currentPeriodEnd);

  if (!shouldSyncStoreSubscription) return;

  await syncStoreSubscription(user).catch((error) => {
    console.error("Error syncing store subscription:", error);
  });
};

export default async function me(req: NextApiRequest, res: NextApiResponse) {
  const token = await verifyToken({ req });

  if (typeof token === "string") {
    res.status(401).json({ response: token });
    return null;
  }

  const userId = token.id;

  if (req.method === "GET") {
    await syncStoreSubscriptionIfNeeded(userId);

    const users = await getUserById(userId);
    return res.status(users.status).json({ response: users.response });
  }
}
