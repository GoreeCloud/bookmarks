import sendVerificationRequest from "@/lib/api/sendVerificationRequest";
import { prisma } from "@linkwarden/prisma";
import { createHash, randomBytes } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";

const emailEnabled =
  process.env.EMAIL_FROM && process.env.EMAIL_SERVER ? true : false;

export default async function requestVerificationEmail(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ response: "Method not allowed." });

  if (
    !emailEnabled ||
    !process.env.NEXTAUTH_URL ||
    !process.env.NEXTAUTH_SECRET
  )
    return res.status(400).json({ response: "Email is not configured." });

  const email =
    typeof req.body.email === "string"
      ? req.body.email.toLowerCase().trim()
      : "";

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) return res.status(400).json({ response: "Invalid email." });

  if (user.emailVerified)
    return res.status(400).json({ response: "Email is already verified." });

  const recentVerificationRequestsCount = await prisma.verificationToken.count({
    where: {
      identifier: email,
      createdAt: {
        gt: new Date(new Date().getTime() - 1000 * 60 * 5),
      },
    },
  });

  if (recentVerificationRequestsCount >= 4)
    return res
      .status(429)
      .json({ response: "Too many requests. Please try again later." });

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1200 * 1000);
  const url = `${
    process.env.NEXTAUTH_URL
  }/callback/email?token=${token}&email=${encodeURIComponent(email)}`;

  await Promise.all([
    sendVerificationRequest({
      identifier: email,
      url,
      from: process.env.EMAIL_FROM as string,
      token,
    }),
    prisma.verificationToken.create({
      data: {
        identifier: email,
        token: createHash("sha256")
          .update(`${token}${process.env.NEXTAUTH_SECRET}`)
          .digest("hex"),
        expires,
      },
    }),
  ]);

  return res.status(200).json({ response: "Verification email sent." });
}
